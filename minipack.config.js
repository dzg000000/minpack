/*
 * @Description: 
 * @version: 
 * @Author: zgdong
 * @Date: 2022-08-10 15:29:45
 * @LastEditors: zgdong
 * @LastEditTime: 2022-08-10 15:31:52
 */




const path = require('path')

module.exports = {
    entry: 'src/entry.js',
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, './dist')
    }
}