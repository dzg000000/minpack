/*
 * @Description: 
 * @version: 
 * @Author: zgdong
 * @Date: 2022-08-10 15:27:56
 * @LastEditors: zgdong
 * @LastEditTime: 2022-08-10 15:28:04
 */
import {hello} from './hello.js'
import {name} from './name.js'

export default function message() {
  console.log(`${hello} ${name}!`)
}
