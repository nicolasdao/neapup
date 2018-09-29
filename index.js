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
const { deploy, list, configure, clean, manage } = require('./src')
const { bold, cyan } = require('./src/utils/console')

program
	.command('configure [opt1] [opt2]')
	.alias('cf')
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
	.usage('. This command lists all the App Engine services currently active in your Google Cloud Platform project.')
	.option('-d, --debug', 'Show debugging messages.')
	.option('-g, --global', 'Choose a project from your account first before listing the services.')
	.option('-e, --env <env>', 'Choose the \'hosting\' settings defined in the app.<env>.json file.')
	.action((opt1, opt2, options) => {
		const { projectPath, provider } = _getParams(opt1, opt2)
		return list(provider, { debug: options.debug, global: options.global, projectPath: projectPath, env: options.env }).then(() => process.exit())
	})

program
	.command('clean [opt1] [opt2]')
	.usage('. This cleans all the Projects currently active in your Google Cloud Platform.')
	.option('-d, --debug', 'Show debugging messages.')
	.action((opt1, opt2, options) => {
		const { provider } = _getParams(opt1, opt2)
		return clean(provider, { debug: options.debug }).then(() => process.exit())
	})

program
	.command('stop [service]')
	.usage('. This stops a service or a service\'s specific version.')
	.option('-d, --debug', 'Show debugging messages.')
	.option('-v, --version <version>', 'Stops a version')
	.option('-p, --project <project>', 'Helps stopping a service faster')
	.option('-f, --force', 'Forces to stop even if the versions indicates it is already stopped')
	.action((service, options) => {
		const v = typeof(options.version) == 'function' ? null : options.version
		return manage.service.stop(service, { debug: options.debug, projectId: options.project, version: v, force: options.force })
			.then(() => process.exit())
	})

program
	.command('start [service]')
	.usage('. This starts a service or a service\'s specific version.')
	.option('-d, --debug', 'Show debugging messages.')
	.option('-v, --version <version>', 'Starts a version')
	.option('-p, --project <project>', 'Helps starting a service faster')
	.option('-f, --force', 'Forces to serve even if the versions indicates it is already serving')
	.action((service, options) => {
		const v = typeof(options.version) == 'function' ? null : options.version
		return manage.service.start(service, { debug: options.debug, projectId: options.project, version: v, force: options.force })
			.then(() => process.exit())
	})

const _getParams = (...options) => {
	const projectPath = options.find(o => o && o.match(/^(\.|\\|\/|~)/)) || null
	const provider = 'google' // options.find(o => o && o.match(/^[a-z]+$/)) || 'google'
	return { projectPath, provider }
}

const emptyCommand = process.argv.length == 2
const versionCommand = !emptyCommand && process.argv.length == 3 && (process.argv[2] == '-v' || process.argv[2] == '--version')
const helpCommand = !emptyCommand && process.argv.length == 3 && (process.argv[2] == '-h' || process.argv[2] == '--help')

if (emptyCommand || helpCommand) {
	console.log(' ')
	console.log('   ╭────────────────────────╮')
	console.log('   │                        │')
	console.log(`   │   ${bold('Welcome to NeapUp!')}   │`)
	console.log('   │                        │')
	console.log('   ╰────────────────────────╯')
	console.log('')
	console.log('Here is a list of commands that will make your day awesome:\n')
	console.log(`${cyan('neap up')} - Run this command in your project, answer a few questions and that's it! You're in the cloud :)`)
	console.log(`${cyan('neap ls')} - List stuffs from your account`)
	console.log(`${cyan('neap cf')} - Configure new or existing app.json files in you current project`)
	console.log(`${cyan('neap start')} - Start a service`)
	console.log(`${cyan('neap stop')} - Stop a service`)
	console.log(`${cyan('neap clean')} - Helps you cleaning your account from leakages (i.e., services that you pay for though they don't serve any traffic)`)
} else if (versionCommand) {
	const pack = require('./package.json')
	console.log(pack.version)
} else
	program.parse(process.argv)





