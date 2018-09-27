/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const utils = require('../utils')

module.exports = {
	service: {
		list: require('./list')
	},
	deploy: require('./deploy'),
	init: require('./init'),
	configure: utils.configure,
	clean: require('./clean'),
	manage: require('./manage')
}





