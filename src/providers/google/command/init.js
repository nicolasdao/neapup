/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */


const { bold, warn, askQuestion, question, success, error } = require('../../../utils/console')
const { obj }  = require('../../../utils')
const utils = require('../utils')
const projectHelper = require('../project')
const { hosting } = require('../config')

/**
 * [description]
 * @param  {Object}   options.appConfig 		[description]
 * @param  {Boolean}  options.overrideAppConfig   [description]
 * @param  {String}   options.env             	[description]
 * @param  {Boolean}  options.debug             [description]
 * @param  {String}   options.projectPath       [description]
 * @return {[type]}                     		[description]
 */
const init = (options={}) => Promise.resolve(null).then(() => {

	const projectPath = projectHelper.getFullPath(options.projectPath)
	const configFileName = `app${options.env ? `.${options.env}`: ''}.json`
	let fileAlreadyExists

	//////////////////////////////
	// 1. Show current project and app engine details to help the user confirm that's the right one.
	//////////////////////////////
	return hosting.get(projectPath, options)
		.then(hostingConfig => {
			const action = Object.keys(hostingConfig || {} ).length > 0 // hosting exists
				? () => {
					fileAlreadyExists = true
					console.log(warn(`An ${bold(configFileName)} file already exists. Hosting config:`, JSON.stringify(hostingConfig, null, ' ')))
					return askQuestion(question('Do you want to continue and override that file (Y/n)? ')).then(answer => {
						if (answer == 'n')
							process.exit()
						return
					})
				}
				: () => Promise.resolve(null)

			return action().then(() => hosting.get(projectPath, options))
		})
		.then(appConfig => utils.project.confirm(obj.merge(options, { appConfig, overrideAppConfig: true })))
		.then(({ projectId, service }) => {
			return hosting.save({ projectId, service: (service || 'default') }, projectPath, options)
		})
		.then(() => console.log(success(`${bold(configFileName)} successfully ${fileAlreadyExists ? 'updated' : 'created'}`)))
		.catch(e => {
			console.log(error(e.message, e.stack))
		})
})

module.exports = init



