var EXPORTED_SYMBOLS = ["Deferred"];

function D () {

const Cc = Components.classes;
const Ci = Components.interfaces;

var timers = [];

if (typeof setTimeout == 'undefined') {
	function setTimeout (f, i) {
		let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
		timer.initWithCallback(f, i, timer.TYPE_ONE_SHOT);
		timers.push(timer);
		return timer;
	}

	function clearTimeout (timer) {
		timers.splice(timers.indexOf(timer), 1);
		timer.cancel();
	}
}

/*include JSDeferred*/

function createWorkerFile() {
	var workerScript = Cc['@mozilla.org/file/directory_service;1']
						.getService(Ci.nsIProperties)
						.get('TmpD', Ci.nsILocalFile);
	workerScript.append('worker.js');
	workerScript.createUnique(workerScript.NORMAL_FILE_TYPE, 0666);

	var script = D.toSource()+'();'+<![CDATA[
			onmessage = function (event) {
				var message = event.data;
				var _global = this;
				switch (message.type) {
					case 'request':
						var data = { id : message.json.id }
						Deferred
							.next(function () {
								return eval(message.json.code);
							})
							.next(function (value) {
								data.value = value;
								postMessage(data);
							})
							.error(function (error) {
								data.error = error;
								postMessage(data);
							});
						break;

					case 'destroy':
						_global.onmessage = undefined;
						break;
				}
			};
			postMessage({ id : -1, init : true });
		]]>.toStirng();

	var stream = Cc['@mozilla.org/network/file-output-stream;1']
					.createInstance(Ci.nsIFileOutputStream);
	stream.init(workerScript, 2, 0x200, false); // open as "write only"
	stream.write(script, script.length);
	stream.close();

	return workerScript;
}

var workers = {};
Deferred.newChromeWorker = function (script) {
	var id  = 0;
	var callbacks = {};
	var queuedMessages = [];

	var workerId = Date.now() + ':' + parseInt(Math.random() * 65000);

	var worker = Cc['@mozilla.org/threads/workerfactory;1']
					.createInstance(Ci.nsIWorkerFactory)
					.newChromeWorker(workerScriptURL);
	worker.onmessage = function (event) {
		var message = event.data;
		if (message.init) {
			for each (let queued in queuedMessage) {
				manager.postMessage(queued);
			}
			queuedMessages = null;
		} else  {
			let callback = callbacks[message.id];
			if (callback) {
				callback(message.value, message.error);
				// We must free the memory. Deferred.next() doesn't expect
				// that the callback function is called multiply.
				delete callbacks[message.id];
			}
		}
	};

	var ret = {
			__proto__ : worker,
			__noSuchMethod__ : function (name, args) {
				return worker[name].apply(worker, args);
			}
		};

	ret.post = function (args, code) {
		var deferred = new Deferred();
		args = Array.prototype.slice.call(arguments, 0);
		code = args.pop();

		code = (typeof code == 'function') ? code.toSource() : 'function () {' + code + '}';

		var message = {
			type : 'request',
			id   : id++,
			code : '(' + code + ').apply(_global, ' + JSON.stringify(args) + ')'
		};

		callbacks[message.id] = function (value, error) { error ? deferred.fail(error) : deferred.call(value) };

		if (queuedMessages) {
			queuedMessages.push(message);
		} else {
			worker.postMessage(message);
		}

		return deferred;
	};

	ret.destroy = function () {
		worker.postMessage({ type : 'destroy' });
		worker.onmessage = undefined;
		worker.terminate();
		delete workers[workerId];
	};

	workers[workerId] = ret;

	ret.post(function() { Deferred.define(this); });

	if (script) ret.post(script, function(script) { importScripts(script); });

	return ret;
};

var messageManagers = {};
Deferred.postie_for_message_manager = function (manager) {
	var ret = {
			__proto__ : manager,
			__noSuchMethod__ : function (name, args) {
				return manager[name].apply(manager, args);
			}
		};
	var id  = 0;
	var callbacks = {};
	var queuedMessages = [];

	var postieId = Date.now() + ':' + parseInt(Math.random() * 65000);

	var messageListener = function (message) {
			message = message.json;
			if (message.init) {
				for each (let queued in queuedMessage) {
					manager.sendAsyncMessage(postieId+':request', queued);
				}
				queuedMessages = null;
			} else  {
				let callback = callbacks[message.id];
				if (callback) {
					callback(message.value, message.error);
					// We must free the memory. Deferred.next() doesn't expect
					// that the callback function is called multiply.
					delete callbacks[message.id];
				}
			}
		};
	manager.addMessageListener(postieId+':response', messageListener);

	manager.loadFrameScript('data:application/javascript,'+encodeURIComponent(<![CDATA[
		(function(_global) {
			var [Deferred, _destroy] = %JSDEFERRED%();
			var _onMessage = function (message) {
					switch (message.name) {
						case '%ID%:request':
							var data = { id : message.json.id }
							Deferred
								.next(function () {
									return eval(message.json.code);
								})
								.next(function (value) {
									data.value = value;
									sendAsyncMessage('%ID%:response', data);
								})
								.error(function (error) {
									data.error = error;
									sendAsyncMessage('%ID%:response', data);
								});
							break;

						case '%ID%:destroy':
							removeMessageListener('%ID%:request', onMessage);
							removeMessageListener('%ID%:destroy', onMessage);
							_destroy();
							_onMessage = undefined;
							_global = undefined;
							break;
					}
				};
			addMessageListener('%ID%:request', _onMessage);
			addMessageListener('%ID%:destroy', _onMessage);
			sendAsyncMessage('%ID%:response', { id : -1, init : true });
		})(this);
	]]>.toString()
		.replace(/%ID%/g, postieId)
		.replace(/%JSDEFERRED%/, D.toSource())
	), false);

	ret.post = function (args, code) {
		var deferred = new Deferred();
		args = Array.prototype.slice.call(arguments, 0);
		code = args.pop();

		code = (typeof code == 'function') ? code.toSource() : 'function () {' + code + '}';

		var message = {
			id : id++,
			code : '(' + code + ').apply(_global, ' + JSON.stringify(args) + ')'
		};

		callbacks[message.id] = function (value, error) { error ? deferred.fail(error) : deferred.call(value) };

		if (queuedMessages) {
			queuedMessages.push(message);
		} else {
			manager.sendAsyncMessage(postieId+':request', message);
		}

		return deferred;
	};

	ret.destroy = function () {
		manager.sendAsyncMessage(postieId+':destroy');
		manager.removeMessageListener(postieId+':response', messageListener);
		delete messageManagers[postieId];
	};

	messageManagers[postieId] = ret;

	return ret;
};

Deferred.postie = function (target) {
	if (target instanceof Ci.nsIFrameMessageManager)
		return Deferred.postie_for_message_manager(target);
	else
		throw new Error('unknown type object was given to Deferred.postie().\n'+target);
};

Deferred.methods.push('postie');

function destroy() {
	timers.forEach(function(aTimer) {
		aTimer.cancel();
	});
	timers = undefined;

	for (let i in workers) {
		workers[i].terminage();
	}
	workers = undefined;

	for (let i in messageManagers) {
		messageManagers[i].sendAsyncMessage(i+':destroy');
	}
	messageManagers = undefined;

	delete Deferred.Deferred;
	Deferred = undefined;
}

Deferred.Deferred = Deferred;
return [Deferred, destroy];
}

var [Deferred, destroy] = D();
