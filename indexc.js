/*
 * @Description:
 * @version:
 * @Author: zgdong
 * @Date: 2022-08-10 15:30:01
 * @LastEditors: zgdong
 * @LastEditTime: 2022-08-10 20:07:23
 */

// 获取配置文件

const config = require("./minipack.config");
const traverse = require("@babel/traverse").default;

const { transformFromAst } = require("@babel/core");

const babelParser = require("@babel/parser");

const fs = require("fs");
const path = require("path");
// 入口
const entry = config.entry;
const output = config.output;

function createAsset(filename) {
  // 读取文件
  const content = fs.readFileSync(filename, "utf-8");
  // 生成AST
  const ast = babelParser.parse(content, {
    sourceType: "module",
  });

  // 获取code
  const { code } = transformFromAst(ast, null, {
    presets: ["@babel/preset-env"],
  });
  // 获取依赖
  const dependencies = [];
  traverse(ast, {
    // 便利所有的 import 模块，并将相对路径放入dependencies
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value);
    },
  });

  return {
    dependencies,
    code,
  };
}

// console.log(createAsset(entry));

/**
 * 从入口文件开始，获取整个依赖图
 * @param {string} entry 入口文件
 */

function createGraph(entry) {
  // 从入口文件开始解析每一个依赖资源并将其一次放入队列中
  const mainAssert = createAsset(entry);
  // 模块
  // 'src/entry': {
  //     code: '', // 文件解析后内容
  //     dependencies: ["./message.js"], // 依赖项
  //     mapping:{
  //     "./message.js": "src/message.js"
  //     }
  // }
  const queue = {
    [entry]: mainAssert,
  };
  /**
   * @inParams:
   * @return {*} 遍历充实queue 队列
   * @name:
   * @description:
   * @param {*} filename 文件路径
   * @param {*} assert 文件内容
   */
  function recursionDep(filename, assert) {
    // 跟踪所有依赖文件
    assert.mapping = {};
    // 由于所有依赖模块的import路径为相对路径 所以获取当前绝对路径
    const dirname = path.dirname(filename);
    console.log("dirname", dirname);
    assert.dependencies.forEach((relativePath) => {
      const absolutePath = path.join(dirname, relativePath);
      // 与当前assert关联
      assert.mapping[relativePath] = absolutePath;
      // 依赖关系没有添加到queue中才让其加入避免重复打包
      if (!queue[absolutePath]) {
        const child = createAsset(absolutePath);
        // 将依赖放入queue 中 与便于for 继续解析依赖资源中的依赖， 直到所有依赖解析完成就构建成了一个从入口文件开始的依赖图
        queue[absolutePath] = child;
        if (child.dependencies.length > 0) {
          // 继续递归
          recursionDep(absolutePath, child);
        }
      }
    });
  }

  // 遍历 queue 获取每一个asset及其所有依赖模块并将其加入到依赖队列中，知道所有模块遍历 完成

  for (let filename in queue) {
    const asset = queue[filename];
    console.log("queue", queue);
    recursionDep(filename, asset);
  }
  return queue;
}
// console.log('end', createGraph(entry));
/**
 * @inParams:
 * @return {*}
 * @name:
 * @description:
 * 打包（使用依赖图 ，返回一个可以在浏览器运行的包）
 * 所以返回一个立即执行函数(function () {})()
 * 这个函数只接受一个参数包含依赖图中的所有信息
 * 遍历graph 将每个mod 以key: value 的形式加入modules, 其中fileName 为key作为唯一标识符 value为一个数组包含 [function(require, module, exports){${mod.code}}, ${JSON.stringify(mod.mapping)}]
 * 其中：function(require, module, exports){${mod.code}} 使用函数包装每一个模块的代码 mode.code，防止 mode.code 污染全局变量或其它模块
 * 并且模块转化后运行在 common.js 系统，它们期望有 require, module, exports 可用
 * 其中：${JSON.stringify(mod.mapping)} 是模块间的依赖关系，当依赖被 require 时调用
 * 例如：{ './message.js': 1 }
 * @param {*} graph
 */
function bundle(graph) {
  let modules = "";

  for (let filename in graph) {
    let mod = graph[filename];
    modules += `'${filename}': [
            function(require, module, exports){
                ${mod.code}
            },
            ${JSON.stringify(mod.mapping)},
        ],`;
  }

  // 注意：modules 是一组 `key: value,`，所以我们将它放入 {} 中
  // 实现 立即执行函数
  // 首先实现一个 require 函数，require('${entry}') 执行入口文件，entry 为入口文件绝对路径，也为模块唯一标识符
  // require 函数接受一个 id（filename 绝对路径） 并在其中查找它模块我们之前构建的对象.
  // 通过解构 const [fn, mapping] = modules[id] 来获得我们的函数包装器和 mappings 对象.
  // 由于一般情况下 require 都是 require 相对路径，而不是id（filename 绝对路径），所以 fn 函数需要将 require 相对路径转换成 require 绝对路径，即 localRequire
  // 注意：不同的模块 id（filename 绝对路径）时唯一的，但相对路径可能存在相同的情况
  //
  // 将 module.exports 传入到 fn 中，将依赖模块内容暴露处理，当 require 某一依赖模块时，就可以直接通过 module.exports 将结果返回

  const result = `
        (function(modules){
            function require (moduleId) {
                const [fn, mapping] = modules[moduleId]
                function localRequire (name) {
                    return require(mapping[name])
                }
                const module = {exports: {}}
                fn(localRequire, module, module.exports)
                return module.exports
            }
            require('${entry}')
        })({${modules}})
    
    `;
  return result;
}

/**
 * 输出打包
 * @param {string} path 路径
 * @param {string} result 内容
 */

function writeFile(path, result) {
  // 写入 ./dist/bundle.js
  fs.writeFile(path, result, (err) => {
    if (err) throw err;
    console.log("文件已被保存");
  });
}

// 获取依赖图
const graph = createGraph(entry)

// 打包
const result = bundle(graph)

// 输出
fs.access(`${output.path}/${output.filename}`, (err) => {
  if(!err) {
    writeFile(`${output.path}/c${output.filename}`, result)
  } else {
    fs.mkdir(output.path, { recursive: true }, (err) => {
      if (err) throw err;
      writeFile(`${output.path}/c${output.filename}`, result)
    });
  }
})

