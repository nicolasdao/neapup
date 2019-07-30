/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */

const { join } = require('path')
const { assert } = require('chai')
const { _: { mergeAppJsons }, appJson } = require('../src/providers/google/config')

describe('google', () => {
	describe('config', () => {
		describe('#_.mergeAppJsons', () => {
			it('01 - Should merge 2 app.json', () => {
				const appJson = {
					'name': 'hello',
					'db': {
						'ip': '0.0.0.0',
						'name': 'housi-local',
						'blackListedIps': ['2.2.2.','3.3.3.'],
						'author': {
							'name': 'Nic',
							'company': 'Neap'
						}
					},
					'hosting': {
						'handlers': [{
							'urlRegex': '.*',
							'script': {
								'scriptPath': 'index.js'
							}
						}],
						'projectId': 'neapers-92845',
						'service': 'default',
						'provider': 'google',
						'instanceClass': 'B2',
						'basicScaling': {
							'maxInstances': 3
						}
					},
					'runtime': 'nodejs',
					'branch': 'master'
				}

				const appTestJson = {
					'env': 'test',
					'db': {
						'ip': '1.2.3.4',
						'name': 'housi-test'
					},
					'hosting': {
						'handlers': [{
							'urlRegex': '.*',
							'script': {
								'scriptPath': 'index-test.js'
							}
						}],
						'service': 'web-api-test',
						'env': 'flex',
						'automaticScaling': {
							'minTotalInstances': 1,
							'maxTotalInstances': 3
						},
						'resources': {
							'cpu': 1,
							'memoryGb': 0.6
						}
					},
					'NODE_ENV': 'production'
				}

				const mergedAppJson = mergeAppJsons(appJson, appTestJson)
				assert.equal(mergedAppJson.name, 'hello', '01')
				assert.equal(mergedAppJson.runtime, 'nodejs', '02')
				assert.equal(mergedAppJson.branch, 'master', '03')
				assert.equal(mergedAppJson.env, 'test', '04')
				assert.equal(mergedAppJson.NODE_ENV, 'production', '05')
				assert.equal(mergedAppJson.db.ip, '1.2.3.4', '06')
				assert.equal(mergedAppJson.db.name, 'housi-test', '07')
				assert.equal(mergedAppJson.db.blackListedIps[0], '2.2.2.', '08')
				assert.equal(mergedAppJson.db.blackListedIps[1], '3.3.3.', '09')
				assert.equal(mergedAppJson.db.author.name, 'Nic', '10')
				assert.equal(mergedAppJson.db.author.company, 'Neap', '11')
				assert.equal(mergedAppJson.hosting.projectId, 'neapers-92845', '12')
				assert.equal(mergedAppJson.hosting.service, 'web-api-test', '13')
				assert.equal(mergedAppJson.hosting.provider, 'google', '14')
				assert.equal(mergedAppJson.hosting.handlers[0].urlRegex, '.*', '15')
				assert.equal(mergedAppJson.hosting.handlers[0].script.scriptPath, 'index-test.js', '16')
				assert.isNotOk(mergedAppJson.hosting.instanceClass, '17')
				assert.isNotOk(mergedAppJson.hosting.basicScaling, '18')
				assert.equal(mergedAppJson.hosting.env, 'flex', '19')
				assert.equal(mergedAppJson.hosting.automaticScaling.minTotalInstances, 1, '20')
				assert.equal(mergedAppJson.hosting.automaticScaling.maxTotalInstances, 3, '21')
				assert.equal(mergedAppJson.hosting.resources.cpu, 1, '22')
				assert.equal(mergedAppJson.hosting.resources.memoryGb, 0.6, '23')
			})
		})
		describe('#appJson.get', () => {
			it('01 - Should get the merged app.json', () => {
				const mockPath = join(__dirname, './mock/mock_01')
				return appJson.get(mockPath, { env: 'test', envOnly: false })
					.then(mergedAppJson => {
						assert.equal(mergedAppJson.name, 'hello', '01')
						assert.equal(mergedAppJson.runtime, 'nodejs', '02')
						assert.equal(mergedAppJson.branch, 'master', '03')
						assert.equal(mergedAppJson.env, 'test', '04')
						assert.equal(mergedAppJson.NODE_ENV, 'production', '05')
						assert.equal(mergedAppJson.db.ip, '1.2.3.4', '06')
						assert.equal(mergedAppJson.db.name, 'housi-test', '07')
						assert.equal(mergedAppJson.db.blackListedIps[0], '2.2.2.', '08')
						assert.equal(mergedAppJson.db.blackListedIps[1], '3.3.3.', '09')
						assert.equal(mergedAppJson.db.author.name, 'Nic', '10')
						assert.equal(mergedAppJson.db.author.company, 'Neap', '11')
						assert.equal(mergedAppJson.hosting.projectId, 'neapers-92845', '12')
						assert.equal(mergedAppJson.hosting.service, 'web-api-test', '13')
						assert.equal(mergedAppJson.hosting.provider, 'google', '14')
						assert.equal(mergedAppJson.hosting.handlers[0].urlRegex, '.*', '15')
						assert.equal(mergedAppJson.hosting.handlers[0].script.scriptPath, 'index-test.js', '16')
						assert.isNotOk(mergedAppJson.hosting.instanceClass, '17')
						assert.isNotOk(mergedAppJson.hosting.basicScaling, '18')
						assert.equal(mergedAppJson.hosting.env, 'flex', '19')
						assert.equal(mergedAppJson.hosting.automaticScaling.minTotalInstances, 1, '20')
						assert.equal(mergedAppJson.hosting.automaticScaling.maxTotalInstances, 3, '21')
						assert.equal(mergedAppJson.hosting.resources.cpu, 1, '22')
						assert.equal(mergedAppJson.hosting.resources.memoryGb, 0.6, '23')
					})
			})
		})
	})
})