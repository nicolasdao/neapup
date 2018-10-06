/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const moment = require('moment-timezone')

const getCurrent = moment.tz.guess
const getAll = moment.tz.names

module.exports = {
	all: getAll,
	system: getCurrent
}
