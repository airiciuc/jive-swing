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

            let types = stanzas.utils;

            let Retrieve = stanzas.define({
                name: 'retrieve',
                element: 'retrieve',
                namespace: 'urn:xmpp:archive',
                fields: {
                    with: types.attribute('with')
                }
            });

            let Set = stanzas.define({
                name: 'set',
                element: 'set',
                namespace: 'http://jabber.org/protocol/rsm'
            });

            let Max = stanzas.define({
                name: 'max',
                element: 'max',
                fields: {
                    value: types.text()
                }
            });

            let First = stanzas.define({
                name: 'first',
                element: 'first',
                fields: {
                    index: types.attribute('index'),
                    value: types.text()
                }
            });

            let After = stanzas.define({
                name: 'after',
                element: 'after',
                fields: {
                    value: types.text()
                }
            });

            stanzas.extend(Set, Max);
            stanzas.extend(Set, After);
            stanzas.extend(Set, First);
            stanzas.extend(Retrieve, Set);

            stanzas.withIq(function (Iq) {
                stanzas.extend(Iq, Retrieve);
            });

            client.getHistory = function (ops) {
                client.sendIq({
                    type: "get",
                    retrieve: ops
                });
            };

            client.on("stream:data", (data, err) => {
                if (!data || !data.xml || data.xml.name !== 'iq') {
                    return;
                }

                let iq = data.xml;
                let chat = iq.children[0];
                if (!chat || chat.name !== 'chat') {
                    return;
                }

                let start = new Date(chat.getAttribute("start"));
                let chatWith = chat.getAttribute("with");

                let messages = data.xml.children[0].children
                    .filter(child => child.name === 'to' || child.name === 'from')
                    .map(function (child) {
                        let tag = child.name;
                        let childWith = child.getAttribute("with");
                        let withJid = new XMPP.JID(childWith ? childWith : chatWith);
                        return {
                            from: tag === 'to' ? client.jid : withJid,
                            to: tag === 'to' ? withJid : client.jid,
                            type: child.getAttribute("name") ? 'groupchat' : 'chat',
                            stamp: new Date(start.getTime() + parseInt(child.getAttribute("secs")) * 1000),
                            body: child.children[0].children[0]
                        }
                    });

                let set = data.xml.children[0].children.find(child => child.name === 'set');
                let count = {
                    first : set.children.find(child => child.name === 'first').children[0],
                    last : set.children.find(child => child.name === 'last').children[0],
                    count : set.children.find(child => child.name === 'count').children[0],
                };

                ee.emitEvent("history", [{
                    messages : messages,
                    count : count
                }]);
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

    this.getHistory = (withJid, max, after) => {
        let ops = {
            with : withJid
        };
        if(max || after) {
            let set = {};
            if(max) {
                set['max'] = {value: max};
            }
            if(after) {
                set['after'] = {value : after};
            }
            ops['set'] = set;
        }
        client.getHistory(ops);
    };

    this.onDirectMessage = (handler) => ee.addListener('direct-message', handler);

    this.onChannelMessage = (handler) => ee.addListener('channel-message', handler);

    this.onHistory = (handler) => ee.addListener('history', handler);

    function getDirectMessages(data) {
        return data.roster.items.map(i => i.jid.bare);
    }

    function getRooms(data) {
        return data.discoItems.items.map(i => i.jid.bare);
    }

    //function getHistoryMessages(data) {
    //    return data.mamResult.items.map(i => i.forwarded.message);
    //}
}