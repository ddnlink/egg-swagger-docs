# @ddn/swagger-docs

SwaggerUI 生成器，可根据 用户注释 自动生成 OpenAPI 的工具。

可以作为 Egg.js 插件使用，也可以作为命令行工具使用。应用启动后访问 /swagger-ui.html 可以浏览接口、测试接口，访问 /swagger-doc，直接获取获取 openapi.json 文件. 

特别感谢：https://github.com/Yanshijie-EL/egg-swagger-doc

## 升级改进

1. [x]  支持 openAPI 3.0 版本，详细规范：[openAPI v3.0.0](https://swagger.io/docs/specification/v3_0/describing-request-body/describing-request-body/)；(如果想要支持 Swagger 2.0 规范，请使用原作者的插件)
2. [x]  支持 RESTful API 参数自动生成；
3. [x]  升级到最新版的 swagger-ui-dist 包；
4. [x] 使用生成的 openAPI.json 生成前端的 Models，请使用插件 [@ddn/openapi](https://github.com/ddnlink/ddn-openapi)；
5. [ ]  支持命令行执行，保证平台无关性，支持除了 Egg.js 框架之外更多应用；
6. [ ]  更多功能待完善。

## 安装

```bash
$ npm i @ddn/swagger-docs --save
```

## 使用

```js
// {app_root}/config/plugin.js
exports.swaggerdoc = {
  enable: true,
  package: '@ddn/swagger-docs',
};
```

## 设置

```js
// {app_root}/config/config.default.js
exports.swaggerdoc = {
  dirScanner: './app/controller',
  apiInfo: {
    title: 'egg-swagger',
    description: 'swagger-ui for egg',
    version: '1.0.0',
  },
  servers: [
    {
      url: "https://petstore3.swagger.io/api/v3"
    },
    {
      url: "http://localhost:7200"
    }
  ],
  consumes: ['application/json'], 
  securitySchemas: {
    // apikey: {
    //   type: 'apiKey',
    //   name: 'clientkey',
    //   in: 'header',
    // },
    // oauth2: {
    //   type: 'oauth2',
    //   tokenUrl: 'http://petstore.swagger.io/oauth/dialog',
    //   flow: 'password',
    //   scopes: {
    //     'write:access_token': 'write access_token',
    //     'read:access_token': 'read access_token',
    //   },
    // },
  },
  enableSecurity: false,
  // enableValidate: true,
  routerMap: false,
  enable: true,
};
```

see [config/config.default.js](config/config.default.js) for more detail.

验证：

- 编辑器： https://editor-next.swagger.io/
- 中文文档: https://openapi.apifox.cn/
- 参考规范 https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.0.3.md

## 介绍

完成插件引入之后，如果不修改默认配置，应用启动后，会自动扫描 app/controller 和 app/contract 下的文件。controller下的文件先不做描述。contract 下的文件为定义好的请求体和响应体。

实验性功能：如果 routerMap 为true, 允许自动生成API路由

@Controller
---
格式：@Controller {ControllerName}

    a.如果文件第一个注释块中存在标签@Controller，应用会扫描当前文件下的所有注释块，否则扫描将会跳过该文件。
    b.如果不标示ControllerName，程序会将当前文件的文件名作为ControllerName。
例：
```js
/**
 * @Controller user
 */
class UserController extends Controller {
  //some method
}
```
@Router
---
格式：@Router {Mothod} {Path}

    a.Mothod,请求的方法(post/get/put/delete等)，不区分大小写。
    b.Path,请求的路由。

输出格式: Method + 操作 ID

例如:

  - '* @router get /api/ledgers/'
  输出: getLedgers
  - '* @router get /api/ledgers/{id}'
  输出: getLedgersById
  - '* @router put /blogs/{id}'
  输出: putBlogsById
  - '* @router get /api/block/statistic'
  输出: getBlockStatistic


@Request 
---
格式：@Request {Position} {Type} {Name} {Description}

    a.position.参数的位置,该值可以是body/path/query/header/formData.
    b.Type.参数类型，body之外位置目前只支持基础类型,integer/string/boolean/number，及基础类型构成的数组，body中则支持contract中定义的类型。如果position是formData还将支持 file 类型
    c.Name.参数名称.如果参数名称以*开头则表示必要，否则非必要。
    d.Description.参数描述
    c.如果你想给query或者path的参数设置example，你可以在Description前添加以'eg:'开头的参数，实例如下
    @Request query string contactId eg:200032234567 顾问ID

@Response
---
格式：@Response {HttpStatus} {Type} {Description}

    a.HttpStatus.Http状态码。
    b.Type.同Request中body位置的参数类型。
    d.Description.响应描述。

@Deprecated
---

    如果注释块中包含此标识，则表示该注释块注明的接口，未完成或不启用。

@Description
---
格式：@Description {Description}

    接口具体描述

@Summary
---
格式：@Summary {Summary}

    接口信息小标题


例：
```js
/**
 * @Controller user
 */
class HomeController extends Controller {
  /**
   * @Router POST /user
   * @Request body createUser name description-createUser
   * @Request header string access_token
   * @Response 200 baseResponse ok
   */
  async index() {
    this.ctx.body = 'hi, ' + this.app.plugins.swagger.name;
  }
```
如果在config中开启并定义了 securitySchemas,默认 enableSecurity 为false.则可在注释块中加入 @apikey，加入安全验证。也可定义成其他名字，只需@定义好的字段名就好。关于 securitySchemas 的定义可以自行搜索。

```js
exports.swaggerdoc = {
  securitySchemas: {
    apikey: {
      type: 'apiKey',
      name: 'clientkey',
      in: 'header',
    },
    // oauth2: {
    //   type: 'oauth2',
    //   tokenUrl: 'http://petstore.swagger.io/oauth/dialog',
    //   flow: 'password',
    //   scopes: {
    //     'write:access_token': 'write access_token',
    //     'read:access_token': 'read access_token',
    //   },
    // },
  },
  enableSecurity: true,
};
```
## contract定义
关于Contract的定义其实在测试代码里面，已经把支持的所有情况都定义出来了。详见[here](test/fixtures/apps/swagger-doc-test/app/contract/request/resource.js),这里我简单说明一下，以下是测试代码中的部分contract。

```js
module.exports = {
  createResource: {
    resourceId: { type: 'string', required: true, example: '1' },
    resourceNametrue: { type: 'string', required: true },
    resourceType: { type: 'string', required: true, enum: ['video', 'game', 'image'] },
    resourceTag: { type: 'array', itemType: 'string' },
    owner: { type: 'User', required: true },
    owners: { type: 'array', itemType: 'User' }
  },
};
```
@基础类型



```js
module.exports = {
  Model名称:{
    字段名称: { type: 字段类型，required: 字段必要性, example: 示例}
  }
}
```
注：type可以是array之外的类型，包括自定义的类型，目前自定义类型不支持example

---

@ENUM


```js
module.exports = {
  Model名称:{
    字段名称: { type: 字段类型，required: 字段必要性, enum:[]}
  }
}
```
注: type只能是string或number，enum为具体的数值组成的集合

---
@ARRAY


```js
module.exports = {
  Model名称:{
    字段名称: { type: "array"，required: 字段必要性, itemType:数组元素类型}
  }
}
```
type为array,itemType为具体的数组元素类型，支持自定义类型。

---
@自定义类型

关于自定义类型，必须定义在contract目录下，在contract下的其他类型中使用时，直接使用Model名称引入。

---

因为contract的定义和validate-rule的定义具有极大的相似性，所以目前的版本中定义contract的同时会简单的生成相应的validate-rule.具体的使用'ctx.rule.'加Model名称直接引入。

上面的model，在做验证的时候就可以使用如下的方式(需使用egg-validate)
```js
ctx.validate(ctx.rule.createResource, ctx.request.body);
```

## Questions & Suggestions

Please open an issue [here](https://github.com/ddnlink/egg-swagger-docs/issues).

## License

[MIT](LICENSE)
