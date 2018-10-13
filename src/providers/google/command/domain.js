/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */


const path = require('path')
const gcp = require('../gcp')
const utils = require('../utils')
const { bold, wait, error, promptList, warn, link, askQuestion, question, success } = require('../../../utils/console')
const { obj: { merge }, file } = require('../../../utils')
const projectHelper = require('../project')
const { listDomains, chooseAProject } = require('./list')

const manageDomains = (options={}) => utils.project.confirm(merge(options, { selectProject: options.selectProject === undefined ? true : options.selectProject, skipAppEngineCheck: true }))
	.then(({ token }) => {
		let waitDone = wait('Gathering information about your Google Cloud Account')
		return gcp.project.list(token, options)
			.then(({ data }) => {
				waitDone()
				const activeProjects = data && data.projects && data.projects.length ? data.projects.filter(({ lifecycleState }) => lifecycleState == 'ACTIVE') : []
				const activeProjectIds = activeProjects.map(p => p.projectId)
				const topLevelChoices = [
					{ name: ' 1. List Custom Domains', value: 'list' },
					{ name: ' 2. Add a Custom Domain', value: 'add' },
					{ name: ' 3. Delete a Custom Domain', value: 'delete' },
					{ name: 'Login to another Google Account', value: 'account', specialOps: true }
				]

				options.projectPath = projectHelper.getFullPath(options.projectPath)

				return promptList({ message: (options.question || 'Choose one of the following options:'), choices: topLevelChoices, separator: false }).then(answer => {
					if (!answer)
						process.exit()
					if (answer == 'list') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, manageDomains, options))
							.then(({ projectId, token }) => listDomains(projectId, token, options))
					else if (answer == 'delete') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, manageDomains, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Listing all domains for project ${bold(projectId)}`)
								return listDomains(projectId, token, merge(options, { displayOff: true }))
									.then(domains => ({ domains, projectId }))
							})
							.then(({ domains, projectId }) => {
								waitDone()
								domains = domains || {}
								const domainList = Object.keys(domains)
								if (domainList.length == 0) {
									console.log('\n   No custom domains found\n')
									return
								}
								const domainNames = Object.keys(domains).reduce((acc, domain) => {
									const records = domains[domain]
									records.map(r => ({ name: `${r.name}.${domain}`, isDomain: r.type != 'CNAME', domain }))
										.forEach(r => acc[r.name] = { isDomain: r.isDomain, records, domain: r.domain })
									return acc
								}, {})
								const choices = Object.keys(domainNames).map((domainName, idx) => ({ name: ` ${idx+1}. ${domainName}`, value: domainName }))
								return promptList({ message: 'Which domain/subdomain do you want to delete?', choices, separator: false }).then(answer => {
									if (answer) {
										const isNotSetupAsSubdomain = domainNames[answer].isDomain
										const subDomains = (domainNames[answer].records || []).filter(r => r.type == 'CNAME')
										const action = (isNotSetupAsSubdomain && subDomains.length > 0)
											? Promise.resolve(null).then(() => {
												console.log(warn(`Deleting ${link(bold(answer))} will also delete its subdomains`))
												return askQuestion(question('Are you sure you want to proceed (Y/n) ? '))
											})
											: Promise.resolve(true)

										return action.then(yes => {
											if (yes != 'n') {
												const fqSubDomains = subDomains.map(x => `${x.name}.${domainNames[answer].domain}`)
												const domainsReadyForDeletion = [...fqSubDomains, answer]
												let counter = domainsReadyForDeletion.length
												let label = counter > 1 ? 'domains' : 'domain'
												waitDone = wait(`Deleting ${counter} custom ${label} in project ${bold(projectId)}`)
												return domainsReadyForDeletion.reduce((job, d) => job.then(() =>  
													gcp.app.domain.delete(projectId, d, token, merge(options, { confirm: true })).then(() => {
														waitDone()
														console.log(success(`Custom domain ${link(bold(d))} successfully deleted`))
														counter--
														if (counter > 0) {
															label = counter > 1 ? 'domains' : 'domain'
															waitDone = wait(`Deleting ${counter} custom ${label} in project ${bold(projectId)}`)
														}
													})), Promise.resolve(null))
											}
										})
									}
								})
							})
					else if (answer == 'account')
						return utils.account.choose(merge(options, { skipProjectSelection: true, skipAppEngineCheck: true })).then(() => manageDomains(options))
					else
						throw new Error('Oops!!! This is not supported yet')
				})
			}).catch(e => {
				waitDone()
				console.log(error('Failed to list services', e.message, e.stack))
				throw e
			})
	})
	.then(() => manageDomains(merge(options, { question: 'What else do you want to do?' })))

const _getAppJsonFiles = (options={}) => file.getJsonFiles(options.projectPath, options)
	.catch(() => [])
	.then(jsonFiles => jsonFiles.map(x => path.basename(x)).filter(x => x.match(/^app\./) && (x.split('.').length == 3 || x.split('.').length == 2)))


module.exports = manageDomains




