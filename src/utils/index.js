/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const core = require('./core')

module.exports = Object.assign(core, {
	file: require('./files'),
	promise: require('./promise'),
	yaml: require('./yaml')
})