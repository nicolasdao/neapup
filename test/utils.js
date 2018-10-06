/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

/* global describe */
/* global it */

const { assert } = require('chai')
const { join } = require('path')
const { obj, file, yaml } = require('../src/utils')

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
})