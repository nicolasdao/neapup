/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const YAML = require('yamljs')

/**
 * Convert camel case to snake case
 * @param  {String} s 	e.g., "helloWorld"
 * @return {String}   	e.g., "hello_world"
 */
const c2sCase = s => (s || '').replace(/\s/g, '').split(/(?=[A-Z]{1})/g).map(x => x.toLowerCase()).join('_')

const c2sObject = obj => {
	if (!obj || typeof(obj) != 'object' || Array.isArray(obj) || typeof(obj.getFullYear) == 'function')
		return obj

	return Object.keys(obj).reduce((acc,key) => {
		const val = obj[key]
		acc[c2sCase(key)] = val ? c2sObject(val) : val
		return acc
	}, {})
}

const objToYaml = obj => YAML.stringify(c2sObject(obj) || {}, 2)

module.exports = {
	objToYaml
}