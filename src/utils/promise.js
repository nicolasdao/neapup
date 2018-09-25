/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const delay = timeout => new Promise(onSuccess => setTimeout(onSuccess, timeout))

const wait = (stopWaiting, options) => Promise.resolve(null).then(() => {
	const now = Date.now()
	const { timeout=300000, start=now, interval=2000 } = options || {}
	
	if ((now - start) > timeout)
		throw new Error('timeout')
	
	return Promise.resolve(null).then(() => stopWaiting()).then(stop => {
		if (stop)
			return
		else
			return delay(interval).then(() => wait(stopWaiting, { timeout, start, interval }))
	})
})

const check = (request, verify, options={}) => request(options.nextState).then(resp => Promise.resolve(verify(resp)).then(result => {
	const { interval=4000, timeOut=300000 } = options
	if (result === true)
		return resp
	else if (timeOut < 0)
		throw new Error('timeout')
	else if (!result || result.nextState)
		return delay(interval).then(() => check(request, verify, { interval, timeOut: timeOut - interval, nextState: result.nextState }))
	else
		return resp
}))

module.exports = {
	delay,
	wait,
	check
}