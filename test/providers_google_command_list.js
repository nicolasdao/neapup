/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const { assert } = require('chai')
const { _: { formatGoogleDomainRes } } = require('../src/providers/google/command/list')

describe('google', () => {
	describe('command', () => {
		describe('list', () => {
			describe('#_.formatGoogleDomainRes', () => {
				it('01 - Should reassemble the google domains into more standard DNS records', () => {
					const googleDomains = [{
						'name': 'apps/housi-188704/domainMappings/api-test.v1.housi.co',
						'id': 'api-test.v1.housi.co',
						'sslSettings': {
							'certificateId': '10430190',
							'sslManagementType': 'AUTOMATIC'
						},
						'resourceRecords': [{
							'rrdata': '216.239.32.21',
							'type': 'A'
						},
						{
							'rrdata': '216.239.34.21',
							'type': 'A'
						},
						{
							'rrdata': '216.239.36.21',
							'type': 'A'
						},
						{
							'rrdata': '216.239.38.21',
							'type': 'A'
						},
						{
							'rrdata': '2001:4860:4802:32::15',
							'type': 'AAAA'
						},
						{
							'rrdata': '2001:4860:4802:34::15',
							'type': 'AAAA'
						},
						{
							'rrdata': '2001:4860:4802:36::15',
							'type': 'AAAA'
						},
						{
							'rrdata': '2001:4860:4802:38::15',
							'type': 'AAAA'
						}]
					},
					{
						'name': 'apps/housi-188704/domainMappings/test.api-test.v1.housi.co',
						'id': 'test.api-test.v1.housi.co',
						'sslSettings': {
							'certificateId': '10428966',
							'sslManagementType': 'AUTOMATIC'
						},
						'resourceRecords': [{
							'name': 'test',
							'rrdata': 'ghs.googlehosted.com',
							'type': 'CNAME'
						}]
					},
					{
						'name': 'apps/housi-188704/domainMappings/www.api-test.v1.housi.co',
						'id': 'www.api-test.v1.housi.co',
						'sslSettings': {
							'certificateId': '10430614',
							'sslManagementType': 'AUTOMATIC'
						},
						'resourceRecords': [{
							'name': 'www',
							'rrdata': 'ghs.googlehosted.com',
							'type': 'CNAME'
						}]
					}]
				
					const domains = formatGoogleDomainRes(googleDomains)
					const domainNames = Object.keys(domains)
					const records = domains[domainNames[0]]
					assert.equal(domainNames.length, 1, '01')
					assert.equal(domainNames[0], 'housi.co', '02')
					assert.equal(records.length, 10, '03')
					assert.equal(records[0].type, 'A', '04')
					assert.equal(records[0].name, 'api-test.v1', '05')
					assert.equal(records[1].type, 'A', '06')
					assert.equal(records[1].name, 'api-test.v1', '07')
					assert.equal(records[2].type, 'A', '08')
					assert.equal(records[2].name, 'api-test.v1', '09')
					assert.equal(records[3].type, 'A', '10')
					assert.equal(records[3].name, 'api-test.v1', '11')
					assert.equal(records[4].type, 'AAAA', '12')
					assert.equal(records[4].name, 'api-test.v1', '13')
					assert.equal(records[5].type, 'AAAA', '14')
					assert.equal(records[5].name, 'api-test.v1', '15')
					assert.equal(records[6].type, 'AAAA', '16')
					assert.equal(records[6].name, 'api-test.v1', '17')
					assert.equal(records[7].type, 'AAAA', '18')
					assert.equal(records[7].name, 'api-test.v1', '19')
					assert.equal(records[8].type, 'CNAME', '20')
					assert.equal(records[8].name, 'test.api-test.v1', '21')
					assert.equal(records[8].rrdata, 'ghs.googlehosted.com', '22')
					assert.equal(records[9].type, 'CNAME', '23')
					assert.equal(records[9].name, 'www.api-test.v1', '24')
					assert.equal(records[9].rrdata, 'ghs.googlehosted.com', '25')
				})
			})
		})
	})
})