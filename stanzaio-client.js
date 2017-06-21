function XmppClient() {

    let client;
    let ee = new EventEmitter();

    this.authenticate = function (username, password, callback) {
        client = XMPP.createClient({
            jid: username,
            password: password,

            transport: 'websocket',

            wsURL: 'wss://jive-swing-xmpp-exp.ecs.devfactory.com:444/ws/',
            boshURL: 'https://jive-swing-xmpp-exp.ecs.devfactory.com/http-bind/'
        });
		
		client.use((client, stanzas, config) => {
			
			client.disco.addFeature('urn:xmpp:archive');		
	
			//let types = stanzas.utils;
	
			var Retrieve = stanzas.define({
				name: 'retrieve',
				element: 'retrieve',
				namespace: 'urn:xmpp:archive'
			});			
			
//			var Chat = stanzas.define({
//				name : 'chat',
//				element: 'chat',
//				namespace: 'urn:xmpp:archive'
//			});
			
//			var From = stanzas.define({
//				name: 'msg_from',
//				element: 'from',
//				namespace: 'urn:xmpp:archive',
//				fields: {
//					with: types.jidAttribute(),
//					name: types.text()
//				}
//			});			
			
//			var To = stanzas.define({
//				name: 'msg_to',
//				element: 'to',
//				namespace: 'urn:xmpp:archive'
//			});		

//			var Body = stanzas.define({
//				name: 'body',
//				element: 'body',
//				namespace: 'urn:xmpp:archive'
//			});					
	
			stanzas.withIq(function (Iq) {
				stanzas.extend(Iq, Retrieve);				
				//stanzas.extend(Iq, Chat);		
				//stanzas.extend(Iq, From, "msg_from", true);				
				//stanzas.extend(Iq, To, "msg_to", true);				
			});
	
			client.getHistory = function () {				
				client.sendIq({
					type: "get", 
					retrieve : {}
				});
			};
			
			client.on("stream:data", (data, err) => {								
				if(!data || !data.xml || data.xml.name !== 'iq'){
					return;
				}
				
				var iq = data.xml;
				var chat = iq.children[0];
				if(!chat || chat.name !== 'chat') {
					return;
				}
				
				var start = new Date(chat.getAttribute("start"));
				
				var history = data.xml.children[0].children
					.map(function (child) { 
						var tag = child.name;
						return {
							from : tag === 'to' ? client.jid : new XMPP.JID(child.getAttribute("with")),
							to : tag === 'to' ? new XMPP.JID(child.getAttribute("with")) : client.jid,
							type : child.getAttribute("name") ? 'groupchat' : 'chat',
							stamp : new Date(start.getTime() + parseInt(child.getAttribute("secs")) * 1000),
							body: child.children[0].children[0]
						}
					});
					
				ee.emitEvent("history", [history]);
			});
		});
		
        client.on('session:started', () => {
            client.sendPresence();
            callback("success");
        });

        client.on('auth:failed', () => callback("failure"));

        client.on('chat', (msg) => ee.emitEvent('direct-message', [msg]));
        client.on('groupchat', (msg) => ee.emitEvent('channel-message', [msg]));
        client.enableKeepAlive({
            'interval': 5,
            'timeout': 10
        });

        client.connect();
		client.sendPresence();
    };

    this.sendDirectMessage = function (to, message) {
        client.sendMessage({
            to: to,
            type: "chat",
            body: message
        });
    };

    this.sendChannelMessage = function (channel, message) {
        client.sendMessage({
            to: channel,
            type: "groupchat",
            body: message
        });
    };

    this.getChannels = (callback) => client.getDiscoItems("muc.swing", "",
        (err, data) => callback(getRooms(data)));

    this.getDirectMessages = (callback) => client.getRoster((err, data) => callback(getDirectMessages(data)));

    this.joinChannel = (jid, nick) => {
        client.joinRoom(jid, nick, {
            joinMuc: {
                history: true
            }
        });

        client.requestRoomVoice(jid);
    };

    //This function loads the entire history, icluding room history - which is also sent by default by openfire.
    //Check https://github.com/legastero/stanza.io/blob/master/docs/Reference.md#clientsearchhistoryopts-cb for search options
    //this.getHistory = (callback) => client.searchHistory({}, (err, data) => callback(getHistoryMessages(data)));

	this.getHistory = () => client.getHistory();
	
    this.onDirectMessage = (handler) => ee.addListener('direct-message', handler);

    this.onChannelMessage = (handler) => ee.addListener('channel-message', handler);
	
	this.onHistory = (handler) => ee.addListener('history', handler);

    function getDirectMessages(data) {
        return data.roster.items.map(i => i.jid.bare);
    }

    function getRooms(data) {
        return data.discoItems.items.map(i => i.jid.bare);
    }

    function getHistoryMessages(data) {
        return data.mamResult.items.map(i => i.forwarded.message);
    }
}