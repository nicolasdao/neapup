/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const path = require('path')
const url = require('url')
const gcp = require('../gcp')
const utils = require('../utils')
const { bold, wait, error, promptList, link, askQuestion, question, success, displayTable, searchAnswer, info } = require('../../../utils/console')
const { obj: { merge }, file, collection, timezone } = require('../../../utils')
const projectHelper = require('../project')
const { chooseAProject } = require('./list')
const getToken = require('../getToken')

const addStuffs = (options={}) => utils.project.confirm(merge(options, { selectProject: options.selectProject === undefined ? true : options.selectProject, skipAppEngineCheck: true }))
	.then(({ token }) => {
		let waitDone = wait('Gathering information about your Google Cloud Account')
		return gcp.project.list(token, options)
			.then(({ data }) => {
				waitDone()
				const activeProjects = data && data.projects && data.projects.length ? data.projects.filter(({ lifecycleState }) => lifecycleState == 'ACTIVE') : []
				const activeProjectIds = activeProjects.map(p => p.projectId)
				const topLevelChoices = [
					{ name: ' 1. Custom Domain', value: 'domain' },
					{ name: ' 2. Routing Rule', value: 'routing' },
					{ name: ' 3. Cron Job', value: 'cron' },
					{ name: ' 4. Task Queue', value: 'queue' },
					{ name: 'Login to another Google Account', value: 'account', specialOps: true }
				]

				options.projectPath = projectHelper.getFullPath(options.projectPath)

				return promptList({ message: (options.question || 'What do you want to add?'), choices: topLevelChoices, separator: false }).then(answer => {
					if (!answer)
						process.exit()
					if (answer == 'domain') 
						throw new Error('Oops!!! This is not supported yet')
					else if (answer == 'cron') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, addStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Getting services for project ${bold(projectId)}`)
								return gcp.app.service.list(projectId, token, merge(options, { verbose: false }))
									.then(({ data: services }) => {
										waitDone()
										if (services.length == 0) {
											console.log(info(`No services found for project ${bold(projectId)}`))
											console.log(info('You cannot add a Cron job if there are no services'))
											console.log(info('Deploy at least one service and then come back here'))
											return
										} else {
											const serviceChoices = services.map((s, idx) => ({ name: ` ${bold(idx+1)}. ${bold(s.id)}`, value: s.id }))
											waitDone = wait(`Getting Cron config for project ${bold(projectId)}`)
											return gcp.app.cron.get(projectId, token, options).then(({ data: cronJobs }) => {
												waitDone()
												const title = `Cron Jobs For Project ${projectId}`
												console.log(`\nCron Jobs For Project ${bold(projectId)}`)
												console.log(collection.seed(title.length).map(() => '=').join(''))
												console.log(' ')
												if (!cronJobs || cronJobs.length == 0)
													console.log('   No Cron jobs found\n')
												else {
													displayTable(cronJobs.map((c, idx) => ({
														id: idx + 1,
														schedule: c.schedule,
														timezone: c.timezone,
														url: c.url,
														service: c.target,
														description: c.description,
														created: c.creationDate
													})), { indent: '   ' })
													console.log(' ')
												}
												let description, pathname, schedule, target, timezone
												// 1. Add a description
												return askQuestion(question('New Cron job description (optional): ')) 
													.then(answer => { // 2. Add a target
														description = answer
														return promptList({ 
															message: 'Which service should be triggered by the Cron job?', 
															choices: serviceChoices, 
															separator: false,
															noAbort: true
														})
													})
													.then(answer => { // 3. Add a url
														target = answer 
														const serviceUrl = `https://${target == 'default' ? projectId : `${target}-dot-${projectId}`}.appspot.com`
														console.log(info(`The Cron job uses HTTP GET to fire your service located at ${link(bold(serviceUrl))}`))
														return askQuestion(question(`Which path should it fire (optional, default is ${bold('/')}) ? `))
													})
													.then(answer => { // 4. Choose a timezone
														pathname = answer ? url.parse(answer).pathname : '/'
														return _chooseTimeZone()
													})
													.then(answer => { // 5. Add a schedule
														timezone = answer
														return _configureCronSchedule()
													})
													.then(answer => { // 6. Add the Cron
														if (answer) {
															schedule = answer
															let cronJob = {
																description,
																url: pathname,
																target,
																schedule: _formatScheduleForGoogle(schedule),
																creationDate: new Date()
															}
															if (timezone)
																cronJob.timezone = timezone
															const newCronJobs = cronJobs || []
															newCronJobs.push(cronJob)
															waitDone = wait('Adding new Cron job...')
															return getToken(options)
																.then(token => gcp.app.cron.update(projectId, newCronJobs, token, options))
																.then(() => {
																	waitDone()
																	console.log(success(`New Cron job successfully added to project ${projectId}`))
																})
														}
													})
											})
										}
									})
							})
					else if (answer == 'queue') 
						return _getAppJsonFiles(options)
							.then(appJsonFiles => chooseAProject(appJsonFiles, activeProjectIds, token, addStuffs, options))
							.then(({ projectId, token }) => {
								waitDone = wait(`Getting services for project ${bold(projectId)}`)
								return gcp.app.service.list(projectId, token, merge(options, { verbose: false }))
									.then(({ data: services }) => {
										waitDone()
										if (services.length == 0) {
											console.log(info(`No services found for project ${bold(projectId)}`))
											console.log(info('You cannot add a Task Queue if there are no services'))
											console.log(info('Deploy at least one service and then come back here'))
											return
										} else {
											const serviceChoices = services.map((s, idx) => ({ name: ` ${bold(idx+1)}. ${bold(s.id)}`, value: s.id }))
											waitDone = wait(`Getting Task Queue config for project ${bold(projectId)}`)
											return gcp.app.queue.get(projectId, token, options).then(({ data: queues }) => {
												waitDone()
												const title = `Task Queues For Project ${projectId}`
												console.log(`\nTask Queues For Project ${bold(projectId)}`)
												console.log(collection.seed(title.length).map(() => '=').join(''))
												console.log(' ')
												if (!queues || queues.length == 0)
													console.log('   No Task Queues found\n')
												else {
													displayTable(queues.map((c, idx) => ({
														id: idx + 1,
														name: c.name,
														service: c.target,
														rate: c.rate,
														'bucket size': c.bucketSize,
														'max concurrent requests': c.maxConcurrentRequests,
														created: c.creationDate
													})), { indent: '   ' })
													console.log(' ')
												}

												let taskQueueName, rate, target, bucketSize, maxConcurrentRequests
												// 1. Add Task Queue name
												return _enterQueueName('Enter a Task Queue name: ', 'The Task Queue name is required')
													.then(answer => { // 2. Add a target
														taskQueueName = answer
														return promptList({ 
															message: 'Which service should react to enqueued tasks? ', 
															choices: serviceChoices, 
															separator: false,
															noAbort: true
														})
													})
													.then(answer => { // 3. Enter a rate
														target = answer 
														const rateUnits = [
															{ name: 'seconds', value: 's' },
															{ name: 'minutes', value: 'm' },
															{ name: 'hours', value: 'h' },
															{ name: 'days', value: 'd' }
														]
														return promptList({ message: 'Choose a time unit for the frequency at which the Task Queue should be processed: ', choices: rateUnits, separator: false, noAbort: true })
															.then(u => _chooseNumber(`How many times per ${bold(rateUnits.find(x => x.value == u).name.replace(/s$/, ''))} do you want to process this Task Queue? `, { ge: 0 }).then(n => `${n}/${u}`))
													})
													.then(answer => { // 4. Enter bucket size
														rate = answer 
														const [ freq, unit ] = rate.split('/')
														const u = { 's': 'seconds', 'm': 'minutes', 'h': 'hours', 'd': 'days' }
														return _chooseNumber(`How many items inside the Task Queue should be processed at once every ${bold(freq)} ${bold(u[unit])} (optional, default is 5) ? `, { ge: 1, default: 5 })
													})
													.then(answer => { // 4. Enter the max concurrent request
														bucketSize = answer
														return _chooseNumber('What\'s the maximum number of concurrent services that can process the Task Queue (optional, default is 1000) ? ', { ge: 1, default: 1000 })
													})
													.then(answer => { // 5. Add the Cron
														maxConcurrentRequests = answer
														let queue = {
															name: taskQueueName, 
															rate, 
															target, 
															bucketSize, 
															maxConcurrentRequests,
															creationDate: new Date()
														}
														const newQueues = queues || []
														newQueues.push(queue)
														waitDone = wait('Creating new Task Queue...')
														return getToken(options)
															.then(token => gcp.app.queue.update(projectId, newQueues, token, options))
															.then(() => {
																waitDone()
																console.log(success(`New Task Queue successfully created in project ${projectId}`))
															})
													})
											})
										}
									})
							})
					else if (answer == 'routing') 
						throw new Error('Oops!!! This is not supported yet')
					else if (answer == 'account')
						return utils.account.choose(merge(options, { skipProjectSelection: true, skipAppEngineCheck: true })).then(() => addStuffs(options))
					else
						throw new Error('Oops!!! This is not supported yet')
				})
			}).catch(e => {
				waitDone()
				console.log(error('Failed to list services', e.message, e.stack))
				throw e
			})
	})
	.then(() => addStuffs(merge(options, { question: 'What else do you want to add? ' })))

const _enterQueueName = () => askQuestion(question('Enter a Task Queue name: ')).then(answer => {
	if (!answer) {
		console.log(error('The task queue name is required.'))
		return _enterQueueName()
	} else if (answer.match(/^[a-zA-Z0-9\-_]+$/))
		return answer
	else {
		console.log(error('Invalid name. A task queue can only contain alphanumerical characters, - and _. Spaces are not allowed.'))
		return _enterQueueName()
	}
})

const _configureCronSchedule = () => Promise.resolve(null)
	.then(() => {
		const cronStyle = [
			{ name: 'every 10 hours', value: 1 },
			{ name: 'every 5 minutes from 10:05 to 15:25', value: 2 },
			{ name: 'every monday 17:46', value: 3 },
			{ name: '1st,3rd wednesday of month 19:23', value: 4 },
			{ name: '1,8,15,22 of month 09:00', value: 5 },
			{ name: '1st,3rd mon,wednesday,thu of sep,oct,nov 17:00', value: 6 },
			{ name: '1,8,15,22 of sep,oct,nov 17:00', value: 7 }
		]
		console.log(question('How often should the Cron job fire the service? '))
		return promptList({ message: 'Configure the frequency using one of the following template:', choices: cronStyle, separator: false })
	})
	.then(answer => {
		const timeUnits = [{ name: 'minutes', value: 'minutes' }, { name: 'hours', value: 'hours' }]
		let timeUnit, freq, start, end, day, days, months
		switch(answer){
		case 1:
			return promptList({ message: 'Choose a time unit:', choices: timeUnits, separator: false, noAbort: true })
				.then(answer => {
					timeUnit = answer
					return _chooseNumber('Enter a frequency number: ', { ge: 1 })
				})
				.then(answer => {
					freq = answer
					const schedule = `every ${freq} ${timeUnit}`
					return _confirmSchedule(schedule)
				})
		case 2:
			return promptList({ message: 'Choose a time unit:', choices: timeUnits, separator: false, noAbort: true })
				.then(answer => {
					timeUnit = answer
					return _chooseNumber('Enter a frequency number: ', { ge: 1 })
				})
				.then(answer => {
					freq = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					return _chooseTime(`Enter an end time using the format ${bold('HH:mm')} (ex: 22:45) : `)
				})
				.then(answer => {
					end = answer
					const schedule = `every ${freq} ${timeUnit} from ${start} to ${end}`
					return _confirmSchedule(schedule)
				})
		case 3:
			return _chooseWeekDay('Choose a day:')
				.then(answer => {
					day = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					const schedule = `every ${day} ${start}`
					return _confirmSchedule(schedule)
				})
		case 4:
			return _chooseWeekDay('Choose a day:', { exclEveryDay: true })
				.then(answer => {
					day = answer
					return _chooseWeekDayFreq(`Enter which ${bold(day)} of the month this Cron should fire your service. Use ',' to add multiple occurences (ex: 1st,3rd): `)
				})
				.then(answer => {
					freq = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					const schedule = `${freq} ${day} of month ${start}`
					return _confirmSchedule(schedule)
				})
		case 5:
			return _chooseDayFreq('Enter which date of the month this Cron should fire your service. Use \',\' to add multiple dates (ex: 4,18,27): ')
				.then(answer => {
					days = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					const schedule = `${days} of month ${start}`
					return _confirmSchedule(schedule)
				})
		case 6:
			return _chooseWeekDayFreqSeq('Enter which day of the month this Cron should fire your service. Use \',\' to add multiple days (ex: monday,wednesday): ')
				.then(answer => {
					days = answer
					return _chooseWeekDayFreq(`Enter which ${bold(days)} of the month this Cron should fire your service. Use ',' to add multiple occurences (ex: 1st,3rd): `)
				})
				.then(answer => {
					freq = answer
					return _chooseMonthFreqSeq('Enter which month of the year this Cron should fire your service. Use \',\' to add multiple occurences (ex: january,may): ')
				})
				.then(answer => {
					months = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					const schedule = `${freq} ${days} of ${months} ${start}`
					return _confirmSchedule(schedule)
				})
		case 7:
			return _chooseDayFreq('Enter which date of the month this Cron should fire your service. Use \',\' to add multiple dates (ex: 4,18,27): ')
				.then(answer => {
					freq = answer
					return _chooseMonthFreqSeq('Enter which month of the year this Cron should fire your service. Use \',\' to add multiple occurences (ex: january,may): ')
				})
				.then(answer => {
					months = answer
					return _chooseTime(`Enter a start time using the format ${bold('HH:mm')} (ex: 16:45) : `)
				})
				.then(answer => {
					start = answer
					const schedule = `${freq} of ${months} ${start}`
					return _confirmSchedule(schedule)
				})
		default:
			return null
		}
	})

const _chooseNumber = (q, options={}) => askQuestion(question(q)).then(n => {
	if (options.default && n !== 0 && !n)
		return options.default

	const nbr = n * 1
	if (n === '' || typeof(nbr) != 'number') {
		console.log(error(`'${n}' is not a number`))
		return _chooseNumber(q, options)
	} else if (options.range && typeof(options.range[0]) == 'number' && typeof(options.range[1]) == 'number' && (nbr < options.range[0] || nbr > options.range[1])) {
		console.log(error(`'${n}' must be defined between ${bold(options.range[0])} and ${bold(options.range[1])}`))
		return _chooseNumber(q, options)
	} else if (options.range && typeof(options.ge) == 'number' && nbr < options.gt) {
		console.log(error(`'${n}' must be greater than or equal to ${bold(options.ge)}`))
		return _chooseNumber(q, options)
	} else  
		return nbr
})

const _chooseWeekDay = (q, options={}) => {
	const weekDays = options.exclEveryDay ? [] : [{ name: 'every day', value: 'day' }]
	weekDays.push(...[
		{ name: 'monday', value: 'monday' },
		{ name: 'tuesday', value: 'tuesday' },
		{ name: 'wednesday', value: 'wednesday' },
		{ name: 'thursday', value: 'thursday' },
		{ name: 'friday', value: 'friday' },
		{ name: 'saturday', value: 'saturday' },
		{ name: 'sunday', value: 'sunday' }
	])

	return promptList({ message: q, choices: weekDays, separator: false, noAbort: true })
}

const VALID_DAY_FREQ = { '1st': true, '2nd': true, '3rd': true, '4th': true }
const _chooseWeekDayFreq = q => askQuestion(question(q))
	.then(answer => {
		if (!answer) {
			console.log(error('You must enter at least one day frequency. Choose either 1st, 2nd, 3rd or 4th'))
			return _chooseWeekDayFreq(q)
		} else {
			const freq = answer.split(',').map(x => x.trim())
			const invalidFreq = freq.filter(f => !VALID_DAY_FREQ[f])
			if (invalidFreq.length > 0) {
				console.log(error(`Invalid day frequency: ${invalidFreq.join(', ')}. Choose either 1st, 2nd, 3rd or 4th`))
				return _chooseWeekDayFreq(q)
			} else
				return collection.sortBy(freq, x => x).join(',')
		}
	})

const VALID_WEEKDAY_FREQ = { 
	'monday': '1_mon', 'mon': '1_mon', 
	'tuesday': '2_tue', 'tue': '2_tue',
	'wednesday': '3_wed', 'wed': '3_wed',
	'thursday': '4_thu', 'thu': '4_thu',
	'friday': '5_fri', 'fri': '5_fri',
	'saturday': '6_sat', 'sat': '6_sat',
	'sunday': '7_sun', 'sun': '7_sun'
}
const _chooseWeekDayFreqSeq = q => askQuestion(question(q))
	.then(answer => {
		if (!answer) {
			console.log(error('You must enter at least one day. Choose either mon, tue, wed, thu, fri, sat, or sun'))
			return _chooseWeekDayFreqSeq(q)
		} else {
			const freq = answer.split(',').map(x => x.trim())
			const invalidFreq = freq.filter(f => !VALID_WEEKDAY_FREQ[f])
			if (invalidFreq.length > 0) {
				console.log(error(`Invalid days: ${invalidFreq.join(', ')}. Choose either mon, tue, wed, thu, fri, sat, or sun`))
				return _chooseWeekDayFreqSeq(q)
			} else 
				return Object.keys(collection.sortBy(freq.map(f => VALID_WEEKDAY_FREQ[f]), x => x).reduce((acc,d) => {
					acc[d.split('_')[1]] = true
					return acc
				}, {})).join(',')
		}
	})

const VALID_MONTH_FREQ = { 
	'january': '01_jan', 'jan': '01_jan', 
	'february': '02_feb', 'feb': '02_feb',
	'march': '03_mar', 'mar': '03_mar',
	'april': '04_apr', 'apr': '04_apr',
	'may': '05_may',
	'june': '06_jun', 'jun': '06_jun',
	'july': '07_jul', 'jul': '07_jul',
	'august': '08_aug', 'aug': '08_aug',
	'september': '09_sep', 'sep': '09_sep',
	'october': '10_oct', 'oct': '10_oct',
	'november': '11_nov', 'nov': '11_nov',
	'december': '12_dec', 'dec': '12_dec'
}
const _chooseMonthFreqSeq = q => askQuestion(question(q))
	.then(answer => {
		if (!answer) {
			console.log(error('You must enter at least one month. Choose either jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, or dec'))
			return _chooseMonthFreqSeq(q)
		} else {
			const freq = answer.split(',').map(x => x.trim())
			const invalidFreq = freq.filter(f => !VALID_MONTH_FREQ[f])
			if (invalidFreq.length > 0) {
				console.log(error(`Invalid months: ${invalidFreq.join(', ')}. Choose either jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, or dec`))
				return _chooseMonthFreqSeq(q)
			} else 
				return Object.keys(collection.sortBy(freq.map(f => VALID_MONTH_FREQ[f]), x => x).reduce((acc,d) => {
					acc[d.split('_')[1]] = true
					return acc
				}, {})).join(',')
		}
	})

const _chooseDayFreq = q => askQuestion(question(q))
	.then(answer => {
		if (!answer) {
			console.log(error('You must enter at least one day of the month. Enter a number between 1 and 31'))
			return _chooseDayFreq(q)
		} else {
			const days = answer.split(',').map(x => x.trim()*1)
			const invalidDays = days.filter(day => typeof(day) != 'number' || day < 1 || day > 31)
			if (invalidDays.length > 0) {
				console.log(error(`Invalid days: ${invalidDays.join(', ')}. Choose a number or a comma separated sequence of numbers between 1 and 31`))
				return _chooseDayFreq(q)
			} else
				return collection.sortBy(days, x => x).join(',')
		}
	})

const _chooseTime = q => askQuestion(question(q)).then(n => {
	const [ hour, minute ] = (n || '').split(':').filter(x => typeof(x.trim()*1) == 'number').map(x => x.trim()*1)
	if (typeof(hour) != 'number' || typeof(minute) != 'number') {
		console.log(error(`'${n}' is not a valid time`))
		return _chooseTime(q)
	} else if (hour < 0 || hour > 23) {
		console.log(error(`hours can only be between 0 and 23. ${hour} is invalid.`))
		return _chooseTime(q)
	} else if (minute < 0 || minute > 59) {
		console.log(error(`minutes can only be between 0 and 59. ${minute} is invalid.`))
		return _chooseTime(q)
	} else {
		const formattedHour = hour < 10 ? `0${hour}` : `${hour}`
		const formattedMinute = minute < 10 ? `0${minute}` : `${minute}`
		return `${formattedHour}:${formattedMinute}`
	}
})

const _confirmSchedule = schedule => {
	console.log(info(`You're about to save this schedule: ${bold(schedule)}`))
	return askQuestion(question('Are you sure yo want to continue (Y/n) ? '))
		.then(answer => {
			if (answer == 'n')
				return _configureCronSchedule()
			else
				return schedule
		})
}

const _chooseTimeZone = () => {
	const systemTz = timezone.system()
	const choices = [
		{ name: `User your current time zone (${bold(systemTz)})`, value: 'system' },
		{ name: 'Use UTC/GMT', value: 'utc' },
		{ name: 'User another time zone', value: 'tz' }
	]

	return promptList({ message: 'Which time zone does your schedule use?', choices, separator: false, noAbort: true })
		.then(answer => {
			if (answer == 'system')
				return systemTz
			else if (answer == 'utc')
				return null
			else {
				const timeZones = timezone.all()
				const filterTz = (input, tzs) => (tzs || []).filter(tz => tz && tz.toLowerCase().indexOf((input || '').toLowerCase()) >= 0)
				return searchAnswer('Search all time zones: ', timeZones, filterTz)
			}
		})
}

const _formatScheduleForGoogle = schedule => 
	(schedule || '')
		.replace(/tue\s/g, 'tuesday ')
		.replace(/tue,/g, 'tuesday,')
		.replace(/thu\s/g, 'thursday ')
		.replace(/thu,/g, 'thursday,')

const _getAppJsonFiles = (options={}) => file.getJsonFiles(options.projectPath, options)
	.catch(() => [])
	.then(jsonFiles => jsonFiles.map(x => path.basename(x)).filter(x => x.match(/^app\./) && (x.split('.').length == 3 || x.split('.').length == 2)))


module.exports = addStuffs




