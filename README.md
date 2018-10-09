# How To Use Me

```js
npm run insta
```

This command will pull the latest changes from git, and re-install neapup globally. 


# About Google Cloud App Engine
## Task Queues
### Creating & Managing Pull Queues

The APIs for managing queues is confusing. Previously, you would have used a `queue.yaml` similar to the Cron job setup. But more recently, Google Cloud released a new API called v2beta3. This REST api is better, otherwise, you need to rely on the more closed RPC Google SDK. 

- [How To Use The New Google Cloud Task API](https://cloud.google.com/tasks/docs/quickstart-appengine)
- [New API To Manage Task Queues](https://cloud.google.com/tasks/docs/reference/rest/v2beta3/projects.locations.queues)
- [How To Create & Configure Push Queues Using The `queue.yaml`](https://cloud.google.com/appengine/docs/standard/python/taskqueue/push/creating-push-queues)
- [What The Handler Will Receive](https://cloud.google.com/appengine/docs/standard/java/taskqueue/push/creating-handlers)

## Setting Up Custom Domain
### Overview

When you set up a custom domain, you set it up for the entire project. All services

__*WARNINGS:*__

- Verifying Your Ownership May Take a While: You will add a TXT record to your DNS to verify your domain ownership. Once setup, this may take a while (up to an hour) before it appears to Google.
- If you're using Cloudflare, make sure you have disabled the CDN, otherwise, the traffic will go through Cloudflare, and the SSL provided by Google won't work. You can check that by pinging your URI and confirming that you see the Google IPs you've set up. If you don't see them, that means that your traffic goes a 3rd party.

### Steps

1. Browse to your App Engine project, and go to __settings__.
2. Click Custom Domain and follow the instructions.

The automation steps are as follow:

1. Verify your domain (that's kind of outside of the Google Cloud API hands as you need to set that up on your DNS. Maybe the verify action).
2. Map the domain to your project. 

### Advanced Routing

[https://cloud.google.com/appengine/docs/standard/python/how-requests-are-routed#routing_via_url](https://cloud.google.com/appengine/docs/standard/python/how-requests-are-routed#routing_via_url)

## Standard vs. Flexible Environments

- [The App Engine Standard Environment](https://cloud.google.com/appengine/docs/standard/)
- [App Engine Flexible Environment for Users of App Engine Standard Environment](https://cloud.google.com/appengine/docs/flexible/python/flexible-for-standard-users)

## Limitations

- Flex max number if running servers: App Engine Flex only allows 9 running versions. The following quotas were exceeded: BACKEND_SERVICES (quota: 9, used: 9 + needed: 1).
- Auto scaling restricted props: "message": "Frontend automatic scaling should NOT have the following parameter(s): [min_total_instances]"

## The __app.json__ File - What You Can Configure In Standard & Flexible Environments
### Overview

Behind the webfunc's _app.json_ lies the official Google Cloud App Engine _app.yaml_ file. The issue with the _app.yaml_ file is its esoteric and inconsistent nomenclature. What Google sells as being simple can become quite complicated and confusing. That's why we decided to create an assistant like _@webfunc/deploy_. _@webfunc/deploy_ sticks to the official nomenclature, to make sure software engineers that have gone through the hassle of learning it feel familiar, but for newbies, we recommend using the assistant rather than editing the _app.json_. Later on, when the concepts have become familiar, editing the _app.json_ might become faster. 

### EbE - Explanation by Examples
#### Simple Standard Environment

- [Scaling config for Standard](https://cloud.google.com/appengine/docs/standard/python/config/appref)

#### Intermediate Standard Environment

#### Advanced Standard Environment

#### Simple Flexible Environment

#### Intermediate Flexible Environment

#### Advanced Flexible Environment

### Scaling Types

Both _Standard_ and _Flexible_ support the same 3 types of scaling types:
- __Auto__
- __Basic__
- __Manual__

The only difference is the ability of _Standard_ to scale down to no instances at all when no requests are received. A service on App Engine's Standard running in auto scaling is the only configuration that can achieve a scale down to no instances. 

#### Auto

_Standard_

```js
{
	automaticScaling: {
		targetCpuUtilization: number,
		targetThroughputUtilization: number,
		maxConcurrentRequests: number,
		minInstances: number,
		maxInstances: number,
		minIdleInstances: number,
		maxIdleInstances: number,
		minPendingLatency: string,
		maxPendingLatency: string
	}
}
```

_Flexible_

```js
{
	automaticScaling: {
		coolDownPeriod: string,
		cpuUtilization: {
			aggregationWindowLength: string,
			targetUtilization: 'number - default: 0.5'
		},
		maxConcurrentRequests: 'number - default: ',
		minIdleInstances: 'number - default: ',
		maxIdleInstances: 'number - default: ',
		minTotalInstances: 'number - default: 2',
		maxTotalInstances: 'number - default: 20',
		minPendingLatency: 'string - default: ',
		maxPendingLatency: 'string - default: ',
		requestUtilization: {
			targetRequestCountPerSecond: number,
			targetConcurrentRequests: number
		},
		diskUtilization: {
			targetWriteBytesPerSecond: number,
			targetWriteOpsPerSecond: number,
			targetReadBytesPerSecond: number,
			targetReadOpsPerSecond: number
		},
		networkUtilization: {
			targetSentBytesPerSecond: number,
			targetSentPacketsPerSecond: number,
			targetReceivedBytesPerSecond: number,
			targetReceivedPacketsPerSecond: number
		}
	}
}
```

#### Basic

_Standard & Flexible_

```js
{
	basicScaling: {
		maxInstances: number,
		idleTimeout: string
	}
}
```

#### Manual

_Standard & Flexible_

```js
{
	manualScaling: {
		instances: number
	}
}
```

__*References*__

- [Quora - Basic vs Auto Scaling](https://www.quora.com/In-Google-App-Engine-how-do-I-decide-if-I-should-use-basic-or-automatic-scaling-Which-is-cheaper) 
- [Blog - Basic vs Auto Scaling](https://www.brightec.co.uk/ideas/scaling-google-app-engine)

### Instances Type

### Flexible Environment Properties

| Property  | Description |
|-----------|--|
| `network` |  |
| `resources` |  |
| `healthCheck` |  |
| `automaticScaling.coolDownPeriod` |  |
| `automaticScaling.cpuUtilization` |  |
| `automaticScaling.minTotalInstances` |  |
| `automaticScaling.maxTotalInstances` |  |
| `automaticScaling.requestUtilization` |  |
| `automaticScaling.diskUtilization` |  |
| `automaticScaling.networkUtilization` |  |

## Instance Types
### Overview - Standard vs Flexible

With _Standard Environments_, only preconfigured instances are available (F1, F2, ...). On the other hand, _Flexible Environments_ offer the ability to choose the specific amount of CPU, disk, memory, network, and more. That being said, in reality, flexible environments don't provide this exact amount of granularity. Instead, it offers access to a greater variety of machine configurations based on the specification you've provided. This list of configuration is referred as __*machine types*__ (for more details, go to [https://cloud.google.com/compute/docs/machine-types](https://cloud.google.com/compute/docs/machine-types)). That list is the same as the one used under Google Compute Engine.

### Standard

- AutomaticScaling: F1, F2, F4, F4_1G
- ManualScaling or BasicScaling: B1, B2, B4, B8, B4_1G

### Flexible

beta_settings:
  machine_type: f1-micro

__*References*__
- [Instance classes](https://cloud.google.com/appengine/docs/standard/#instance_classes)
- [How Instances are Managed](https://cloud.google.com/appengine/docs/standard/nodejs/how-instances-are-managed)
- [Google Compute Engine Pricing](https://cloud.google.com/compute/pricing#machinetype)

# Rolling Back
- Browse to [https://console.cloud.google.com/appengine/versions?project=neapers-92845&serviceId=web-api](https://console.cloud.google.com/appengine/versions?project=neapers-92845&serviceId=web-api).
- Select your version.
- Click the __MIGRATE TRAFFIC__ button.

# How To
## How to deploy a nodejs to App Engine?
- [Deploying Your Apps with the Admin API](https://cloud.google.com/appengine/docs/admin-api/deploying-overview)

## How to swap traffic between versions?
- [Migrating and Splitting Traffic with the Admin API](https://cloud.google.com/appengine/docs/admin-api/migrating-splitting-traffic)

## How to build an app.yaml or an app.json file?
### General
- [Configuration of your App with app.yaml](https://cloud.google.com/appengine/docs/flexible/nodejs/configuring-your-app-with-app-yaml)
- [Advanced configuration of your App with app.yaml](https://cloud.google.com/appengine/docs/flexible/nodejs/reference/app-yaml)
- [All the properties of an app.json](https://cloud.google.com/appengine/docs/admin-api/reference/rest/v1/apps.services.versions)

### How to add wildcard subdomain to access services?

After adding your custom domain (set of A and AAAA records) in GCP, add a new wildcard subdomain. For more details, go to [On Google App Engine subdomain routing](https://medium.com/@david.michael/on-google-app-engine-subdomain-routing-aef8a81fff94).

### The deployment property
- [Deployment](https://cloud.google.com/appengine/docs/admin-api/reference/rest/v1/apps.services.versions#Deployment)


# License
Copyright (c) 2018, Neap Pty Ltd.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
* Neither the name of Neap Pty Ltd nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL NEAP PTY LTD BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

<p align="center"><a href="https://neap.co" target="_blank"><img src="https://neap.co/img/neap_color_horizontal.png" alt="Neap Pty Ltd logo" title="Neap" height="89" width="200"/></a></p>
