'use strict';

const path = require('path');
const fs = require('fs');

const contract = require('../contract/index');
const comment = require('../comment/index');
const _ = require('../constant/index');
const { type } = require('os');
/**
 * swagger Document
 * 
 * 参考规范：
 * 
 * https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.0.3.md
 */
let DOCUMENT;
let FUNCTIONBUNDLER = [];
/**
 * 构建Document
 * @controller {tagName} {description} 接受swaggerDoc扫描，并命名该controller名字，默认为文件名
 * @summary {content} 接口标题
 * @description {content} 接口描述
 * @router {method} {routerkey} 接口请求地址
 * @request {position} {type} {name} {description} 请求体
 * @response {http_status} {type} {description} 响应体
 * @consume {consume} 例 @consume application/json
 * @produce {produce} 例 @consume application/json
 * @ignore 实验性功能，自动生成路由时(需遵循一定规则)，跳过指定非 API function扫描
 */
function buildDocument(app) {
  // config
  const config = app.config.swaggerdoc;

  let securitys = [];
  let tag_path = {
    tags: [],
    paths: {},
  };

  // 允许使用验证
  if (config.enableSecurity) {
    // 获取定义的安全验证名称
    for (let security in config.securitySchemes) {
      securitys.push(security);
    }
  }

  // 遍历contract,组装swagger.components
  let components = contract.getDefinitions(app);
  let filepath = path.join(app.config.baseDir, config.dirScanner);

  // 递归获取 tags&paths
  tag_path = getTag_Path(filepath, securitys, config, components);

  // swagger: "2.0" 与 openAPI 3.0 是不一样的，这里仅处理成 epenAPI 3.0 文档
  // 其差别：https://www.jianshu.com/p/879baf1cff07
  // build document
  DOCUMENT = {
    openapi: config.openapi || '3.0.3',
    info: config.apiInfo,
    servers: config.servers,
    tags: tag_path.tags,
    paths: tag_path.paths,
    components: {
      schemas: components,
      securitySchemes: config.securitySchemes,
    },
  };

  return DOCUMENT;
}

function firstUpperCase(str) {
  return str.toLowerCase().replace(/( |^)[a-z]/g, (L) => L.toUpperCase());
}

/**
 * 生成operationId
 * @param {*} routerArray 
 * 
 * 例如：
 * '* @router get /api/ledgers/' 输出: getLedgers
 * '* @router get /api/ledgers/{id}' 输出: getLedgersById
 * '* @router put /blogs/{id}'  输出: putBlogsById
 * '* @router get /api/block/statistic' 输出: getBlockStatistic
 */
function getOperationId(routerArray) {
  // 提取 HTTP 方法和路径
  const [method, path] = routerArray[0].slice(1); // 取出方法和路径

  // 处理路径，去掉前缀 /api/ 和末尾的 /
  const cleanPath = path.replace('/api/', '').replace(/\/$/, '');

  // 将路径按 / 分割
  const segments = cleanPath.split('/');

  // 生成操作 ID
  let operationId = segments.map(segment => {
    // 如果是动态参数（如 {id}），则转换为 'ById'
    if (segment.startsWith('{') && segment.endsWith('}')) {
      return 'ById';
    }
    // 将每个段首字母大写
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  }).join('');

  // 添加 HTTP 方法前缀
  return `${method}${operationId}`;
}

// 示例用法
function getTag_Path(fileDir, securitys, config, components) {

  // 已存在tag集合
  let tagNames = [];
  let tags = [];
  let paths = {};

  const names = fs.readdirSync(fileDir);
  for (let name of names) {

    const filepath = path.join(fileDir, name);
    const stat = fs.statSync(filepath);

    if (stat.isDirectory()) {
      const subPath = getTag_Path(filepath, securitys, config, components);
      // 合并子目录的扫描结果
      tags = tags.concat(subPath.tags);
      Object.assign(paths, subPath.paths);
      continue;
    }

    if (stat.isFile() && ['.js', '.ts'].indexOf(path.extname(name)) !== -1) {

      const extname = path.extname(name);
      if (extname === '.ts') {
        const jsFile = name.replace('.ts', '.js');
        if (names.indexOf(jsFile) >= 0) {
          continue;
        }
      }

      let blocks = comment.generateCommentBlocks(filepath);

      // 如果第一个注释块不包含@controller不对该文件注释解析
      if (blocks.length === 0 || !hasController(blocks[0])) continue;

      // 当前注释块集合的所属tag-group, 并添加至swagger.tags中
      let controller = comment.getComment(blocks[0], _.CONTROLLER)[0];
      let tagName = controller[1] ? controller[1] : name.split(/\.(js|ts)/)[0];
      if (tagNames.includes(tagName)) {
        tagName = tagName + '_' + tagNames.length;
      }
      tagNames.push(tagName);

      tags.push({ name: tagName, description: controller[2] ? controller[2] : '' });

      // 获取所有的有效方法
      let func = generateAPIFunc(filepath);
      let bundler = {
        filePath: filepath,
        routers: [],
      };

      let routerlist = [];
      for (let i = 1; i < blocks.length; i++) {

        if (isIgnore(blocks[i])) continue;

        // let direct = `${filepath.split(/\.(js|ts)/)[0].split('app')[1].substr(1)}`;
        // 解析路由
        let routers = comment.getComment(blocks[i], _.ROUTER);
        const method = routers[0][1].toLowerCase();
        const route = routers[0][2];

        if (routers) {
          // let operationId = route.split('/').map(item => firstUpperCase(item)).join('')
          const operationId = getOperationId(routers);
          const path_method = {};
          path_method.tags = [tagName];
          path_method.summary = generateSummary(blocks[i]);
          path_method.description = generateDescription(blocks[i]);
          path_method.operationId = operationId;
          // 3.0 不再需要 imfly
          // path_method.consumes = generateConsumes(blocks[i], config);
          // path_method.produces = generateProduces(blocks[i], config);
          const requests = generateRequest(blocks[i], routers, components, config)
          const body = requests.filter(item => !item.in)[0];
          
          if (body) {
            path_method.requestBody = body
          }

          const params = requests.filter(item => item.in);
          if (params.length > 0) {
            path_method.parameters = params;
          }
   
          path_method.security = generateSecurity(blocks[i], securitys, config);
          path_method.responses = generateResponse(blocks[i], routers, components);
          path_method.deprecated = isDeprecated(blocks[i]);

          if (!routerlist.includes(route)) {
            paths[route] = {};
          }

          routerlist.push(route);
          paths[route][method] = path_method;

          // 绑定route和function
          let contractName = getContractInBody(blocks[i], components);
          let router = {
            method,
            route,
            func: func[i - 1],
            ruleName: contractName,
          };
          // console.log('routerlist', router);

          bundler.routers.push(router);
        }
      }
      FUNCTIONBUNDLER.push(bundler);
    }
  }

  return {
    tags,
    paths,
  };
}

/**
 * 判断是否包含@Controller标签
 * @param {String} block 注释块
 * @return {Boolean} 是否包含@Controller标签
 */
function hasController(block) {
  return block.indexOf('@Controller') > -1 || block.indexOf('@controller') > -1;
}

/**
 * 获取controller的方法， 按定义顺序
 * @param {String} filepath controller文件地址
 */
function generateAPIFunc(filepath) {
  let func = [];
  let obj = require(filepath);
  if (path.extname(filepath) === '.ts') {
    obj = obj.default;
  }

  let instance = obj.prototype || obj;
  func = Object.getOwnPropertyNames(instance).map(key => {
    return key;
  });

  if (func[0] === 'constructor') {
    func.shift();
  }

  return func;
}

/**
 * 是否跳过该方法
 * @param {string} block 注释块
 */
function isIgnore(block) {
  return block.indexOf('@Ignore') > -1 || block.indexOf('@ignore') > -1;
}

/**
 * 是否无效接口
 * @param {string} block 注释块
 */
function isDeprecated(block) {
  return block.indexOf('@Deprecated') > -1 || block.indexOf('@deprecated') > -1;
}

/**
 * 解析安全验证
 * @param {String} block 注释块
 * @param {Array} securitys 设定的安全验证名称
 * @param {Object} config swagger配置
 */
function generateSecurity(block, securitys, config) {
  let securityDoc = [];
  for (let security of securitys) {
    if (block.indexOf(`@${security}`) > -1) {
      let securityItem = {};
      if (config.securitySchemes[security].type === 'apiKey') {
        securityItem[security] = [];
        securityItem[security].push(config.securitySchemes[security]);
      }
      if (config.securitySchemes[security].type === 'oauth2') {
        securityItem[security] = [];
        Object.keys(config.securitySchemes[security].scopes).forEach(i => {
          securityItem[security].push(i);
        });
      }
      securityDoc.push(securityItem);
    }
  }
  return securityDoc;
}

/**
 * 获取api标题
 * @param {String} block 注释块
 */
function generateSummary(block) {
  let summary = '';
  let summarys = comment.getComment(block, _.SUMMARY);
  if (summarys) {
    let m = 1;
    while (summarys[0][m]) {
      summary = summary + summarys[0][m] + ' ';
      m++;
    }
  }
  return summary;
}
/**
 * 获取api接口描述
 * @param {String} block 注释块
 */
function generateDescription(block) {
  let description = '';
  let descriptions = comment.getComment(block.replace(/^\s+\*\s+^/gm, '\n').replace(/^\s+\*\s*/gm, ''), _.DESCRIPTION);
  if (descriptions) {
    let m = 1;
    while (descriptions[0][m]) {
      description = description + descriptions[0][m] + ' ';
      m++;
    }
  }
  return description;
}

/**
 * fixme 待删除
 * 获取请求的produces
 * @param {String} block comment block
 * @param {Object} config config of swagger
 */
function generateProduces(block, config) {
  let produces = [];
  let produceComments = comment.getComment(block, _.PRODUCE);
  if (produceComments) {
    for (let item of produceComments) {
      for (let key in item) {
        if (Number(key) === 0) continue;
        produces.push(item[key]);
      }
    }
  } else {
    produces = config.produces;
  }
  return produces;
}

/**
 * 获取请求的consumes
 * @param {String} block comment block
 * @param {Object} config config of swagger
 */
function generateConsumes(block, config) {
  let consumes = [];
  let consumeComments = comment.getComment(block, _.CONSUME);
  if (consumeComments) {
    for (let item of consumeComments) {
      for (let key in item) {
        if (Number(key) === 0) continue;
        consumes.push(item[key]);
      }
    }
  } else {
    consumes = config.consumes;
  }
  return consumes;
}

/**
 * 获取请求参数
 * @param {String} block 注释块
 * @param {Array} routers 路由列表
 * @param {Object} components contract信息
 */
function generateRequest(block, routers, components, config) {
  let parameters = [];
  let requests = comment.getComment(block, _.REQUEST);
  if (requests) {
    for (let request of requests) {
      let parameter = generateParameters(request, routers, components, config);
      parameters.push(parameter);
    }
  }
  return parameters;
}

/**
 * 获取request in body
 * @param {String} block comment
 * @param {Object} components contract定义
 */
function getContractInBody(block, components) {
  let requests = comment.getComment(block, _.REQUEST);
  if (requests) {
    for (let request of requests) {
      if (request[1] === 'body' && components.hasOwnProperty(request[2])) {
        return request[2];
      }
    }
  }
}

/**
 * 获取响应参数
 * @param {String} block 注释块
 * @param {Array} routers 路由列表
 * @param {Object} components contract信息
 * 
 * e.g：
 * {
 *  "description": "A complex object array response",
 *  "content": {
 *    "application/json": {
 *      "schema": {
 *        "type": "array",
 *        "items": {
 *          "$ref": "#/components/schemas/VeryComplexType"
 *        }
 *      }
 *    }
 *  }
 * }
 */
function generateResponse(block, routers, components) {
  let responseDoc = {};
  let responses = comment.getComment(block, _.RESPONSE);
  if (responses) {
    for (let response of responses) {
      let res = {};
      let schema = {};

      if (response[2]) {
        if (!components.hasOwnProperty(response[2])) {
          throw new Error(`[egg-swagger-docs] error at ${routers[0][1].toLowerCase()}:${routers[0][2]} ,the type of response parameter does not exit`);
        }

        if (response[1] == 'array') {
          // todo: 这部分写死了 'application/json'，用于适配 openapi 3.0 imfly 2024.10.8
          schema = {
            type: 'array',
            items: {
              $ref: `#/components/schemas/${response[2]}`
            }
          };
        } else {
          schema = {
            $ref: `#/components/schemas/${response[2]}`
          };
        }

        res.content = {
          'application/json': { schema }
        };
      }

      res.description = '';
      if (response[3]) {
        let m = 3;
        while (response[m]) {
          res.description = res.description + response[m] + ' ';
          m++;
        }
      }

      responseDoc[response[1]] = res;
    }
  } else {
    responseDoc.default = { description: 'successful operation' };
  }

  return responseDoc;
}
/**
 * 获取请求参数
 * @param {String} request 包含@Request的注释行,以空格分割的得到的数组
 * @param {Array} routers 路由信息
 * @param {Object} components contract信息
 * @param {Object} config swagger 配置
 */
function generateParameters(request, routers, components, config) {
  const parameter = {};
  const requestIn = request[1];

  /**
   * 获取 Body 参数类型
   * 
   * 参考：https://swagger.io/docs/specification/v3_0/describing-request-body/describing-request-body/
   * 
   * If you used OpenAPI 2.0 before, here is a summary of changes to help you get started with OpenAPI 3.0:

   *  - Body and form parameters are replaced with requestBody.
   *  - Operations can now consume both form data and other media types such as JSON.
   *  - The consumes array is replaced with the requestBody.content map which maps the media types to their schemas.
   *  - Schemas can vary by media type.
   *  - anyOf and oneOf can be used to specify alternate schemas.
   *  - Form data can now contain objects, and you can specify the serialization strategy for objects and arrays.
   *  - GET, DELETE and HEAD are no longer allowed to have request body because it does not have defined semantics as per RFC 7231.
   */
  if (requestIn.toLowerCase() === 'body' && !_.itemType.includes(request[2])) {
    parameter.content = {}

    let schema = {};
    if (!request[2].startsWith('array')) {
      if (!components.hasOwnProperty(request[2])) {
        throw new Error(`[egg-swagger-docs] error at ${routers[0][1].toLowerCase()}:${routers[0][2]} ,the type of request parameter does not exit`);
      }
      schema.$ref = `#/components/schemas/${request[2]}`;
    } else {
      schema.type = 'array';
      let ObjectType = ['boolean', 'integer', 'number', 'string'];
      let items = {};
      let itemsType = request[2].substring(6, request[2].length - 1);
      if (ObjectType.includes(itemsType)) {
        items.type = itemsType;
      } else {
        if (!components.hasOwnProperty(itemsType)) {
          throw new Error(`[egg-swagger-docs] error at ${routers[0][1].toLowerCase()}:${routers[0][2]} ,the type of request parameter does not exit`);
        }
        items.$ref = `#/components/schemas/${itemsType}`;
      }
      schema.items = items;
    }

    config.consumes.map(item => {
      parameter.content[item] = {};
      parameter.content[item].schema = schema;
    });

  } else if (requestIn.toLowerCase() === 'query' && request[2].startsWith('array')) {
    parameter.schema = {};
    parameter.schema.type = 'array';
    parameter.in = requestIn;

    let ObjectType = ['boolean', 'integer', 'number', 'string'];
    let items = {};
    let itemsType = request[2].substring(6);

    if (!ObjectType.includes(itemsType)) {
      throw new Error(`[egg-swagger-docs] error at ${routers[0][1].toLowerCase()}:${routers[0][2]} ,the type of request parameter does not exit`);
    }

    items.type = itemsType;

    parameter.items = items;
    parameter.collectionFormat = "multi"
  } else {
    parameter.schema = {};
    parameter.schema.type = request[2];
    parameter.in = requestIn;
  }

  if (request[3] && requestIn !== 'body') {
    parameter.name = request[3].replace('*', '');

    parameter.required = false;
    if (request[3].indexOf('*') > -1 || requestIn === 'path') {
      parameter.required = true;
    }
  }

  if (requestIn.toLowerCase() === 'body') {
    parameter.required = true;
  }

  parameter.description = '';

  let i = 4;
  while (request[i]) {
    if (request[i].indexOf('eg:') > -1) {
      const example = request[i].replace('eg:', '');

      if (request[2].startsWith('array')) {
        parameter.items.example = example
      } else {
        parameter.example = example
      }
    }
    if (request[i].indexOf('enum:') > -1) {
      const enums = request[i].replace('enum:', '').split(',');

      if (request[2].startsWith('array')) {
        parameter.items.enum = enums
      } else {
        parameter.enum = enums
      }
    } else {
      parameter.description = parameter.description + request[i] + ' ';
    }
    i++;
  }

  return parameter;
}

module.exports = {

  documentInit: app => {

    if (!DOCUMENT) {
      buildDocument(app);
    }

    return DOCUMENT;
  },

  getFuncBundler: app => {
    if (!FUNCTIONBUNDLER) {
      buildDocument(app);
    }

    return FUNCTIONBUNDLER;
  },
};
