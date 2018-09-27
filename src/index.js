/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const { 
	deploy: gcpDeploy, 
	service: gcpService, 
	init: gcpInit, 
	configure: gcpConfigure,
	clean: gcpClean,
	manage: gcpManage
} = require('./providers/google/command')

const deploy = (provider='google', options={}) => Promise.resolve(null).then(() => {
	if (provider == 'google')
		return gcpDeploy(options)
})

const list = (provider='google', options={}) => Promise.resolve(null).then(() => {
	if (provider == 'google')
		return gcpService.list(options)
})

const init = (provider='google', options={}) => Promise.resolve(null).then(() => {
	if (provider == 'google')
		return gcpInit(options)
})

const configure = (provider='google', options={}) => Promise.resolve(null).then(() => {
	if (provider == 'google')
		return gcpConfigure(options)
})

const clean = (provider='google', options={}) => Promise.resolve(null).then(() => {
	if (provider == 'google')
		return gcpClean(options)
})

module.exports = {
	deploy,
	init,
	list,
	configure,
	clean,
	manage: gcpManage
}