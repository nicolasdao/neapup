/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */


const core = require('./core')

module.exports = Object.assign(core, {
	file: require('./files'),
	promise: require('./promise'),
	yaml: require('./yaml'),
	timezone: require('./timezone'),
	functional: require('./functional'),
	console: require('./console.v2')
})