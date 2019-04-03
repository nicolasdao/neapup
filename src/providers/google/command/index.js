/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */


const utils = require('../utils')
const { list } = require('./list')
const { add } = require('./add')
const serve = require('./serve')

module.exports = {
	service: {
		list 
	},
	deploy: require('./deploy'),
	init: require('./init'),
	configure: utils.configure,
	clean: require('./clean'),
	manage: require('./manage'),
	domain: require('./domain'),
	remove: require('./remove'),
	add,
	serve
}





