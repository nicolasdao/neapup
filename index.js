#!/usr/bin/env node

/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

'use strict'

const program = require('commander')
const { cmd, info } = require('./src/utils/console')
const { login } = require('./src/providers/google/account')
const { deploy, list, configure, clean } = require('./src')

program
	.version('1.0.0')
	.command('login [provider]')
	.usage(`. This command logs the user to his/her Google Cloud (${cmd('neap login google')}) or AWS (${cmd('neap login aws')}) account. Default is 'google' (${cmd('neap login')}). `)
	.option('-d, --debug', 'Show debugging messages.')
	.action((provider='google', options) => {
		if (provider == 'google')
			return login({ debug: options.debug })
				.then(() => {
					console.log(info('Awesome! You\'re now logged in.'))
					console.log(info(`If you want to switch to another project, simply type ${cmd('neap switch')}.`))
					process.exit()
				})
	})

program
	.command('configure [opt1] [opt2]')
	.alias('cfg')
	.usage('. This command helps you to configure an app.json file in your project. This file contains hosting informations.')
	.option('-d, --debug', 'Show debugging messages.')
	.option('-e, --env <env>', 'Choose the \'hosting\' settings defined in the app.<env>.json file.')
	.action((opt1, opt2, options) => { 
		const { projectPath, provider } = _getParams(opt1, opt2)
		return configure(provider, { debug: options.debug, projectPath: projectPath, env: options.env }).then(() => process.exit())
	})

program
	.command('deploy [opt1] [opt2]')
	.alias('up')
	.usage('. This command deploys the targetted project to the specified cloud provider (i.e., either Google Cloud or AWS). Default provider is \'google\'')
	.option('-d, --debug', 'Show debugging messages.')
	.option('-c, --custom', 'Helps to override the \'hosting\' property of the app.json file.')
	.option('-e, --env [env]', 'Choose the \'hosting\' settings defined in the app.<env>.json file.')
	.action((opt1, opt2, options) => { 
		const { projectPath, provider } = _getParams(opt1, opt2)
		const opts = { 
			debug: options.debug, 
			projectPath: projectPath, 
			overrideHostingConfig: options.custom, 
			env: options.env === true ? null : options.env,
			chooseAppJson: options.env === true
		}
		return deploy(provider, opts).then(() => process.exit())
	})

program
	.command('list [opt1] [opt2]')
	.alias('ls')
	.usage('List all the App Engine services currently active in your Google Cloud Platform project.')
	.option('-d, --debug', 'Show debugging messages.')
	.option('-g, --global', 'Choose a project from your account first before listing the services.')
	.option('-e, --env <env>', 'Choose the \'hosting\' settings defined in the app.<env>.json file.')
	.action((opt1, opt2, options) => {
		const { projectPath, provider } = _getParams(opt1, opt2)
		return list(provider, { debug: options.debug, global: options.global, projectPath: projectPath, env: options.env }).then(() => process.exit())
	})

program
	.command('clean [opt1] [opt2]')
	.usage('Clean all the Projects currently active in your Google Cloud Platform.')
	.option('-d, --debug', 'Show debugging messages.')
	.action((opt1, opt2, options) => {
		const { provider } = _getParams(opt1, opt2)
		return clean(provider, { debug: options.debug }).then(() => process.exit())
	})

const _getParams = (...options) => {
	const projectPath = options.find(o => o && o.match(/^(\.|\\|\/|~)/)) || null
	const provider = 'google' // options.find(o => o && o.match(/^[a-z]+$/)) || 'google'
	return { projectPath, provider }
}

program.parse(process.argv)





