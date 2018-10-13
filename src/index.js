/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */


const { 
	deploy: gcpDeploy, 
	service: gcpService, 
	init: gcpInit, 
	configure: gcpConfigure,
	clean: gcpClean,
	manage,
	domain,
	remove,
	add
} = require('./providers/google/command')

const deploy = (provider='google', options={}) => Promise.resolve(null).then(() => {
	if (provider == 'google')
		return gcpDeploy(options)
})

const list = (provider='google', options={}) => Promise.resolve(null).then(() => {
	if (provider == 'google')
		return gcpService.list(options)
})

const init = (provider='google', options={}) => Promise.resolve(null).then(() => {
	if (provider == 'google')
		return gcpInit(options)
})

const configure = (provider='google', options={}) => Promise.resolve(null).then(() => {
	if (provider == 'google')
		return gcpConfigure(options)
})

const clean = (provider='google', options={}) => Promise.resolve(null).then(() => {
	if (provider == 'google')
		return gcpClean(options)
})

module.exports = {
	deploy,
	init,
	list,
	configure,
	clean,
	manage,
	domain,
	remove,
	add
}