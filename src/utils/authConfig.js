/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */

const { join } = require('path')
const { homedir } = require('os')
const { file } = require('./index')
const { error, debugInfo } = require('./console')

const CONFIGFILE = join(homedir(), '.neapup.json')

const getAuthConfig = (options={ debug:false }) => Promise.resolve(null).then(() => {
	const { debug } = options || {}
	if (debug)
		console.log(debugInfo('Retrieving \'.neapup.json\' config file stored in local storage.'))

	return file.exists(CONFIGFILE).then(() => file.read(CONFIGFILE)).then(c => {
		if (debug)
			console.log(debugInfo('Found a \'.neapup.json\' config file stored locally.'))
		try {
			if (c) {
				const config = JSON.parse(c) || {}
				if (config && config.google && config.google.project && typeof(config.google.project) != 'string')
					config.google.project = null
				return config
			} else
				return {}
		} catch(e) {
			console.log(error(e.message))
			console.log(error(e.stack))
			return {}
		}
	}).catch(() => {
		if (debug)
			console.log(debugInfo('No \'.neapup.json\' config file has been stored locally yet.'))
		return {}
	})
})

const updateAuthConfig = config => file.write(CONFIGFILE, JSON.stringify(config || {}, null, '\t'))

module.exports = {
	'get': getAuthConfig,
	update: updateAuthConfig
}