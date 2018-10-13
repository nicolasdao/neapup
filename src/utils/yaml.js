/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
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

const objToYaml = obj => YAML.stringify(c2sObject(obj) || {}, 6)
const yamlToObj = str => YAML.parse(str)

module.exports = {
	objToYaml,
	yamlToObj
}