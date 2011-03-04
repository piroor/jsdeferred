var EXPORTED_SYMBOLS = ["Deferred"];

function D () {

var timers = [];

function setTimeout (f, i) {
	let timer = Components.classes["@mozilla.org/timer;1"]
					.createInstance(Components.interfaces.nsITimer);
	timer.initWithCallback(f, i, timer.TYPE_ONE_SHOT);
	timers.push(timer);
	return timer;
}

function clearTimeout (timer) {
	timers.splice(timers.indexOf(timer), 1);
	timer.cancel();
}

/*include JSDeferred*/

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

		callback[message.id] = function (value, error) { error ? deferred.fail(error) : deferred.call(value) };

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
	};

	messageManagers[postieId] = ret;

	return ret;
};

Deferred.postie = function (target) {
	if (target instanceof Components.interfaces.nsIFrameMessageManager)
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
