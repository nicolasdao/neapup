/**
 * Copyright (C) 2017-2018 neap pty ltd nic@neap.co
 * 
 * This file is part of the neapup project.
 * 
 * The neapup project can not be copied and/or distributed without the express
 * permission of neap pty ltd nic@neap.co.
 */


/* global describe */
/* global it */

const { assert } = require('chai')
const { join } = require('path')
const { obj, file, yaml, functional, promise, collection } = require('../src/utils')

describe('utils', () => {
	describe('obj', () => {
		describe('#merge', () => {
			it('01 - Should create deep merged non-referenced objects.', () => {
				const a = { user: { firstName: 'Nic', lastName: 'Dao' } }
				const b = { age: 37 }
				let result = obj.merge(a, b)
				assert.isOk(result.user, 'Error - 01')
				assert.equal(result.user.firstName, 'Nic', 'Error - 02')
				assert.equal(result.user.lastName, 'Dao', 'Error - 03')
				assert.equal(result.age, 37, 'Error - 04')
				result.age++
				assert.equal(result.age, 38, 'Error - 05')
				assert.equal(b.age, 37, 'Error - 06')
			})
			it('02 - Should only update leaf properties instead of overidding parent completely.', () => {
				const a = { user: { firstName: 'Nic', lastName: 'Dao', companies: [ 'Neap', 'Quivers' ] ,parent: { mum: { name: 'Domi', age: 64 } } } }
				const b = { age: 37 }
				const c = { user: { firstName: 'Nicolas', companies: [ 'Neap' ] ,parent: { mum: { name: 'Dominique' } } } }
				let result = obj.merge(a, b, c)
				assert.isOk(result.user, 'Error - 01')
				assert.equal(result.user.firstName, 'Nicolas', 'Error - 02')
				assert.equal(result.user.lastName, 'Dao', 'Error - 03')
				assert.equal(result.age, 37, 'Error - 04')
				assert.equal(result.user.companies.length, 1, 'Error - 05')
				assert.equal(result.user.companies[0], 'Neap', 'Error - 06')
				assert.isOk(result.user.parent, 'Error - 07')
				assert.isOk(result.user.parent.mum, 'Error - 08')
				assert.equal(result.user.parent.mum.name, 'Dominique', 'Error - 09')
				assert.equal(result.user.parent.mum.age, 64, 'Error - 10')
			})
			it('03 - Should be able to nullify a property.', () => {
				const a = { user: { firstName: 'Nic', lastName: 'Dao', companies: [ 'Neap', 'Quivers' ] ,parent: { mum: { name: 'Domi', age: 64 } } } }
				const b = { age: 37 }
				const c = { user: { firstName: 'Nicolas', companies: [ 'Neap' ] ,parent: null } }
				let result = obj.merge(a, b, c)
				assert.isOk(result.user, 'Error - 01')
				assert.equal(result.user.firstName, 'Nicolas', 'Error - 02')
				assert.equal(result.user.lastName, 'Dao', 'Error - 03')
				assert.equal(result.age, 37, 'Error - 04')
				assert.equal(result.user.companies.length, 1, 'Error - 05')
				assert.equal(result.user.companies[0], 'Neap', 'Error - 06')
				assert.isNotOk(result.user.parent, 'Error - 07')
			})
		})
		describe('#diff', () => {
			it('01 - Should diff 2 objects.', () => {
				const a_01 = { user: { firstname: 'Nic', lastname: 'Dao', age: 37 }, job: 'Neap', office: { type: 'home' } }
				const b_01 = { user: { firstname: 'Nic', lastname: 'Kramer', age: 23 }, job: 'Neap', office: { type: 'home', address: { line1: 'Waterloo' } } }
				const diff_01 = obj.diff(a_01, b_01)
				assert.isOk(diff_01, '1')
				assert.isOk(diff_01.user, '2')
				assert.isOk(diff_01.office, '3')
				assert.isOk(diff_01.office.address, '4')
				assert.isNotOk(diff_01.job, '5')
				assert.isNotOk(diff_01.user.firstname, '6')
				assert.isNotOk(diff_01.office.type, '7')
				assert.equal(diff_01.user.lastname, 'Kramer', '8')
				assert.equal(diff_01.user.age, 23, '9')
				assert.equal(diff_01.office.address.line1, 'Waterloo', '10')
			})
		})
		describe('#same', () => {
			it('01 - Should determine if objects are identical.', () => {
				const a_01 = { user: { firstname: 'Nic', lastname: 'Dao', age: 37 }, job: 'Neap', office: { type: 'home' } }
				const b_01 = { user: { firstname: 'Nic', lastname: 'Kramer', age: 23 }, job: 'Neap', office: { type: 'home', address: { line1: 'Waterloo' } } }
				assert.isNotOk(obj.same(a_01, b_01), '01')
				assert.isOk(obj.same({ name: 'Nic' }, { name: 'Nic' }), '02')
			})
		})
	})

	describe('file', () => {
		describe('#getRootDir', () => {
			it('01 - Should return the root folder of an array of files and sub-folders.', () => {
				const files = [
					join('Users', 'batman', 'documents', 'project', 'webfunc', 'src', 'index.js'),
					join('Users', 'batman', 'documents', 'project', 'webfunc', 'src', 'html' ,'index.html'),
					join('Users', 'batman', 'documents', 'project', 'webfunc', 'app.js'),
					join('Users', 'batman', 'documents', 'project', 'webfunc', 'package.json')
				]
				const rootDir = file.getRootDir(files)
				assert.equal(rootDir, join('Users', 'batman', 'documents', 'project', 'webfunc'), '01')
			})
		})
	})

	describe('yaml', () => {
		describe('#objToYaml', () => {
			it('01 - Should convert JSON to YAML.', () => {
				const yaml_01 = yaml.objToYaml({
					cron: [{
						description: 'Hello world',
						url: '/',
						schedule: 'every 1 mins'
					}, {
						description: 'Hello Madam',
						url: '/home/*',
						schedule: 'every 10 hours'
					}]
				})

				const result_01 = `
				cron:
					-
					    description: 'Hello world'
					    url: /
					    schedule: 'every 1 mins'
					-
					    description: 'Hello Madam'
					    url: '/home/*'
					    schedule: 'every 10 hours'`

				assert.equal(yaml_01.replace(/(\n|\s)/g, ''), result_01.replace(/(\n|\s)/g, ''), '01')
			})
		})
	})

	describe('functional', () => {
		describe('#arities', () => {
			it('01 - Should create a function that supports multiple arities.', () => {
				const fn = functional.arities(
					'String firstName, Object options={}', 
					'String firstName, Function getLastName, Object options={}',
					({ firstName, getLastName, options={} }) => ({ firstName, getLastName, options }))

				const r_01 = fn('Nic', () => 'Dao', { age: 37 })
				const r_02 = fn('Boris', { age: 31 })
				const r_03 = fn('Brendan')

				assert.equal(r_01.firstName, 'Nic', '01')
				assert.equal(r_01.getLastName(), 'Dao','02')
				assert.equal(r_01.options.age, 37, '03')
				assert.equal(r_02.firstName, 'Boris', '04')
				assert.isNotOk(r_02.getLastName, '05')
				assert.equal(r_02.options.age, 31, '06')
				assert.equal(r_03.firstName, 'Brendan', '07')
				assert.isNotOk(r_03.getLastName, '08')
				assert.isOk(r_03.options, '09')
				assert.isNotOk(r_03.options.age, '10')
			})

			it('02 - Should throw an error if none of the rules match one of the arities.', () => {
				const fn = functional.arities(
					'String firstName, Object options={}', 
					'String firstName, Function getLastName, Object options={}',
					({ firstName, getLastName, options }) => ({ firstName, getLastName, options }))
				
				const r_02 = fn('Boris', { age: 31 })

				assert.equal(r_02.firstName, 'Boris', '01')
				assert.isNotOk(r_02.getLastName, '02')
				assert.equal(r_02.options.age, 31, '03')
				assert.throws(() => fn('Nic', 'Dao', { age: 37 }), Error, /.*Invalid arguments exception.*/)
			})
		})
	})

	describe('promise', () => {
		describe('#retry', () => {
			it('01 - Should retry functions that return the wrong response.', () => {
				let counter = 0
				const fn = () => {
					counter++
					if (counter < 3)
						return 'no good'
					else
						return `good after ${counter} attempts`
				}
				const successFn = resp => resp != 'no good'
				return promise.retry(fn, successFn, { retryInterval: 2 }).then(answer => {
					assert.equal(answer, 'good after 3 attempts', '01')
				})
			})

			it('02 - Should retry functions that fail when the \'ignoreFailure\' flag is set to true.', () => {
				let counter = 0
				const fn = () => {
					counter++
					if (counter < 3)
						throw new Error('Boom')
					else
						return `good after ${counter} attempts`
				}
				const successFn = resp => resp != 'no good'
				return promise.retry(fn, successFn, { retryInterval: 2, ignoreFailure: true }).then(answer => {
					assert.equal(answer, 'good after 3 attempts', '01')
				})
			})

			it('03 - Should retry functions that fail when the \'ignoreFailure\' flag is set to true.', () => {
				let counter = 0
				const fn = () => {
					counter++
					if (counter < 3)
						throw new Error('Boom')
					else
						return `good after ${counter} attempts`
				}
				const successFn = resp => resp != 'no good'
				return promise.retry(fn, successFn, { retryInterval: 2, ignoreFailure: true }).then(answer => {
					assert.equal(answer, 'good after 3 attempts', '01')
				})
			})
		})
	})

	describe('collection', () => {
		describe('#merge', () => {
			it('01 - Should merge collections of different sizes.', () => {
				const res_01 = collection.merge([1,2], [1,2,3,4,5], [10])
				assert.equal(res_01.length, 3, '01')
				assert.equal(res_01[0].length, 5, '02')
				assert.equal(res_01[1].length, 5, '03')
				assert.equal(res_01[2].length, 5, '04')
				assert.equal(res_01[0].filter(x => x).join(','), '1,2', '05')
				assert.equal(res_01[1].filter(x => x).join(','), '1,2,3,4,5', '06')
				assert.equal(res_01[2].filter(x => x).join(','), '10', '07')

				const res_02 = collection.merge([], [])
				assert.equal(res_02.length, 2, '08')
				assert.equal(res_02[0].length, 0, '09')
				assert.equal(res_02[1].length, 0, '10')

				const res_03 = collection.merge([], [], [1])
				assert.equal(res_03.length, 3, '11')
				assert.equal(res_03[0].length, 1, '12')
				assert.equal(res_03[1].length, 1, '13')
				assert.equal(res_03[2].length, 1, '14')
			})
		})
	})
})