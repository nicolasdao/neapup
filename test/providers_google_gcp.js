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
const gcp = require('../src/providers/google/gcp')

describe('providers', () => {
	describe('google', () => {
		describe('gcp', () => {
			describe('#_', () => {
				it('01 - Should get all the object\'s fully qualified property names.', () => {
					const a = gcp._.getFullyQualifiedPropNames({ 
						user: { 
							firstName: 'Nic', 
							lastName: 'Dao' 
						}, 
						job: 'Neap', 
						friend: { 
							user: { 
								name: 'Boris', 
								friend: { 
									user: { 
										name: 'Brendan' 
									} 
								} 
							} 
						} 
					})
					assert.equal(a.length, 5, '1')
					assert.equal(a[0], 'user.firstName', '2')
					assert.equal(a[1], 'user.lastName', '3')
					assert.equal(a[2], 'job', '4')
					assert.equal(a[3], 'friend.user.name', '5')
					assert.equal(a[4], 'friend.user.friend.user.name', '6')
				})
			})
		})
	})
})