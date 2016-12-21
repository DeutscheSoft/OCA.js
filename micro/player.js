(function (w) {
"use strict"

/* BEGIN CONFIGURATION */

var websocket = 'ws://'+document.location.host;

var sources = [
    {
        files: [ "audio/Drums.wav.mp3", "audio/Drums.wav.ogg" ],
        loop: true,
        "class": "drums"
    },
    {
        files: [ "audio/Bass.wav.mp3", "audio/Bass.wav.ogg" ],
        loop: true,
        "class": "bass"
    },
    {
        files: [ "audio/FX.wav.mp3", "audio/FX.wav.ogg" ],
        loop: true,
        "class": "fx"
    },
    {
        files: [ "audio/Pad.wav.mp3", "audio/Pad.wav.ogg" ],
        loop: true,
        "class": "pad"
    },
    {
        files: [ "audio/Arpeggio.wav.mp3", "audio/Arpeggio.wav.ogg" ],
        loop: true,
        fx: ["filter"],
        "class": "arpeggio"
    },
    {
        files: [ "audio/Claves.wav.mp3", "audio/claves.wav.ogg" ],
        "class": "claves"
    },
    {
        files: [ "audio/Clap.wav.mp3", "audio/Clap.wav.ogg" ],
        "class": "clap"
    },
    {
        files: [ "audio/Crash.wav.mp3", "audio/Crash.wav.ogg" ],
        "class": "crash"
    }
];

var elements = {
    "10000" : { type : "analyzer" },
    "10001" : { type : "analyzer" },
    "10002" : { type : "analyzer" },
    "10003" : { type : "analyzer" },
    "10004" : { type : "analyzer" },
    "10005" : { type : "analyzer" },
    "10006" : { type : "analyzer" },
    "10007" : { type : "analyzer" },
    
    "10200" : { type : "sources", actuator : "10400", sources : sources },
    
    "10300" : { type : "knob", id : "master", min : -36, max : 24 , step : 0.5, scale : "db" },
    "10301" : { type : "knob", id : "filter", min : Math.log10(250), max : Math.log10(10000) , step : 0.01, scale : "hz" },
}

var analyzer_strips = 32;
var analyzer_leds = 12;
var analyzer_retention = 120;
var marquee_retention = 80;
var marquee_delay = 6000;
var oneshot_lit = 250;

var master_styles = "#player > .knob {background: {color};}\n#player > #analyzer > .strip > .led {background: {color};}\n#player > #sources > .source,#player > #toggle {border: 3px solid {color};}";

/* END OF CONFIGURATION */

var init = function () {
    
    w.app = new Application(websocket, sources);
    
    FastClick.attach(document.body);
    
    document.addEventListener('touchmove', function(e){
        e.preventDefault(); 
    });
}

var Application = function (websocket, sources) {
    
    this.sources = sources;
    this.websocket = websocket;
    this.analyzer = { x : 0, y : 0, objects : [], last : 0 };
    
    this.m_iter = 0;
    this.m_next = 0;
    this.m_to = -1;
    this.marquee = true;
    
    this.init = function () {
        this.ctx = w.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.Tree = [];
        this.Player = new Player(this.ctx);
        this.UI = new UI(analyzer_strips);
        this.ws = w.ws = new WebSocket(this.websocket);
        this.ws.onopen = this.connect.bind(this);
        this.Device = w.device = new OCA.RemoteDevice(new OCA.WebSocketConnection(this.ws));
        this.UI.node.addEventListener("start", (function () {
            this.Player.start();
            this.set_marquee(false);
        }).bind(this));
        this.UI.node.addEventListener("stop", (function () {
            this.Player.stop();
            this.set_marquee(true);
        }).bind(this));
        
        this.style = element('style', {}, document.body)
    }
    
    this.connect = function () {
        this.Device.discover_all().then((function (res) {
            this.Tree = res;
            for (var i = 0; i < this.Tree.length; i++) {
                var o = this.Tree[i];
                if (elements[o.ObjectNumber]) {
                    var f = elements[o.ObjectNumber];
                    switch (f.type) {
                        case "sources":
                            this.add_sources(f, o);
                            break;
                        case "analyzer":
                            this.add_analyzer(f, o);
                            break;
                        case "knob":
                            this.add_knob(f, o);
                            break;
                    }
                }
            }
            document.body.classList.remove("loading");
            this.draw_analyzer();
        }).bind(this), function (err) {
            console.error(res);
            document.body.classList.remove("loading");
        });
    }
    
    this.add_sources = function (element, object) {
        // get actuator
        var act = null;
        if (element.actuator) {
            for (var j = 0; j < this.Tree.length; j++) {
                if (this.Tree[j].ObjectNumber == element.actuator) {
                    act = this.Tree[j];
                    break;
                }
            }
        }
        var p = this.Player;
        var ui = this.UI;
        var that = this;
        object.GetNrBits().then(function(N) {
            for (var i = 0; i < N; i++) {
                var s = element.sources[i];
                s.id = i;
                s.actuator = act;
                s.pressed = false;
                var t = ui.add_source(s);
                var a = p.add_source(s);
                
                s.button.onclick = (function (_s) {
                    return function (e) {
                        that.set_source(_s);
                    }
                })(s);
            }
            var update_actuator = function (a) {
                console.log(a)
                for (var i = 0; i < a.length; i++) {
                    if (a[i] && !element.sources[i].pressed)
                        that.set_source(element.sources[i]);
                    element.sources[i].pressed = a[i];
                }
                
            }
            object.on_property_changed("BitString", update_actuator)
                .catch(function(err) { OCA.error("Subscription failed", err); });
            act.GetBitstring().then(update_actuator);
        });
    }
    
    this.add_analyzer = function (element, object) {
        object.GetNrBits().then((function(amount) {
            this.analyzer.y = Math.max(this.analyzer.y, amount);
            this.analyzer.objects.push(object);
        }).bind(this));
        
    }
    
    this.add_knob = function (element, object) {
        this.UI.add_knob(element, object);
        switch (element.id) {
            case "filter":
                element.set = function (v) {
                    var f = Math.log10(this.target.value);
                    f += v * this.step;
                    f = Math.min(this.max, Math.max(this.min, f));
                    this.target.value = Math.pow(10, f);
                }
                element.get = function () {
                    var f = Math.log10(this.target.value);
                    return (f - this.min) / (this.max - this.min)
                }
                element.value = this.Player.filter.frequency.value;
                element.last = 0;
                element.target = this.Player.filter.frequency;
                break;
            case "master":
                element.set = function (v) {
                    var f = 20 * Math.log10(this.target.value);
                    f += v * this.step;
                    f = Math.min(this.max, Math.max(this.min, f));
                    f = Math.pow(10, (f / 20));
                    this.target.value = f;
                }
                var that = this;
                element.get = function () {
                    var f = 20 * Math.log10(this.target.value);
                    var val = (f - this.min) / (this.max - this.min);
                    var color = hsv2css(val, 1, 0.33);
                    that.style.innerHTML = master_styles.replace(/{color}/g, color);
                    return val;
                }
                element.value = this.Player.master.gain.value;
                element.last = 0;
                element.target = this.Player.master.gain;
                break;
        }
        var reading = (function (e, that) {
            return function (a) {
                var v = a - e.last;
                if (v > 200) v -= 256;
                else if (v < -200) v += 256;
                e.set(v);
                e.bar.style.height = (e.get() * 100) + "%";
                e.last = a;
            }
        })(element, this);
        object.on_property_changed("Reading", reading)
            .catch(function(err) { OCA.error("Subscription failed", err); });
        object.GetReading().then((function (e) {
            return function (a) { e.last = a; }
        })(element));
        element.bar.style.height = (element.get() * 100) + "%";
    }
    
    this.draw_analyzer = function () {
        if (this.marquee) {
            var t = (new Date()).getTime();
            if (t > this.m_next) {
                var d = [];
                for (var i = 0; i < analyzer_strips; i++) {
                    var g = [];
                    var j = (this.m_iter + i) % marquee[0].length;
                    for (var k = 0; k < marquee.length; k++) {
                        g.push(marquee[k][j]);
                    }
                    d.push(g);
                }
                this.UI.draw_analyzer(d);
                this.set_remote_analyzer(d);
                this.m_iter = (this.m_iter + 1) % marquee[0].length;
                this.m_next = t + marquee_retention;
            }
        } else {
            this.UI.draw_analyzer(this.Player.get_analyzer(analyzer_strips, analyzer_leds));
            var d = (new Date()).getTime();
            if (d > (this.analyzer.last + analyzer_retention)) {
                var data = this.Player.get_analyzer(this.analyzer.objects.length, this.analyzer.y);
                this.set_remote_analyzer(data);
                this.analyzer.last = d;
            }
        }
        requestAnimationFrame(this.draw_analyzer.bind(this));
    }
    
    this.set_source = function (s) {
        var ui = this.UI;
        var p = this.Player;
        if (s.loop) {
            var v = s.started ? 0 : 1;
            p.set_source(s, v);
            ui.set_source(s, v);
            s.actuator.SetBit(s.id, v);
        } else {
            p.set_source(s, 1);
            ui.set_source(s, 1);
            s.actuator.SetBit(s.id, 1);
            if (s.timeout >= 0)
                clearTimeout(s.timeout);
            s.timeout = setTimeout(function () {
                ui.set_source(s, 0);
                s.actuator.SetBit(s.id, 0);
                s.timeout = -1;
            }, oneshot_lit);
            this.set_marquee(true);
        }
    }
    
    this.set_marquee = function (state) {
        this.marquee = false;
        if (this.m_to > 0) {
            clearTimeout(this.m_to);
        }
        if (state && !this.Player.started) {
            this.m_to = setTimeout((function () {
                this.marquee = true;
                this.m_iter = - analyzer_strips;
                this.m_to = -1;
            }).bind(this), marquee_delay);
        } else {
            this.marquee = false;
        }
    }
    
    this.set_remote_analyzer = function (data) {
        for (var i = 0; i < this.analyzer.objects.length; i++) {
            var r = [];
            for (var j = 0; j < this.analyzer.y; j++) {
                if (typeof data[0] == "object")
                    r[this.analyzer.y - j - 1] = data[i][j];
                else
                    r[j] = (j <= data[i] - 1);
            }
            this.analyzer.objects[i].SetBitstring(r);
        }
    }
    
    this.init();
}


var Player = function (ctx) {
    
    this.ctx = ctx;
    this.started = false;
    this.sources = [];
    this.init = function () {
        
        // Analyzer
        this.sr = ctx.sampleRate;
        
        this.analyzer = this.ctx.createAnalyser();
        this.analyzer.fftSize = 8192;
        this.analyzer.smoothingTimeConstant = 0.8;
        
        this.a_fft_strips = this.analyzer.frequencyBinCount;
        this.a_data = new Float32Array(this.a_fft_strips);
        
        this.a_minf = 10;
        this.a_maxf = 20000;
        this.a_minf10 = Math.log10(this.a_minf);
        this.a_maxf10 = Math.log10(this.a_maxf); 
        this.a_maxs = parseInt((this.a_maxf / (this.sr / 2)) * this.a_fft_strips);
        this.a_mindb = this.analyzer.minDecibels;
        this.a_maxdb = this.analyzer.maxDecibels;
        
        // Filter
        this.filter = this.ctx.createBiquadFilter();
        this.filter.frequency.value = 750;
        this.filter.Q.value = 12;
        
        // Mixer
        this.mixer = this.ctx.createChannelMerger(16);
        
        // Master
        this.master = this.ctx.createGain();
        
        // Compressor
        this.compressor = this.ctx.createDynamicsCompressor();
        
        // Nullinger
        // crazy workaround to prevent WebAudio analyzerNode from
        // generating false results if nothing is connected or no
        // signal is played. It is a simple white noise generator
        // feeding the analyzer at a very small level.
        var buf = this.ctx.createBuffer(1, this.sr, this.sr);
        var b = buf.getChannelData(0);
        for (var i = 0; i < this.sr; i++) {
            b[i] = Math.random() * 1e-4 - 5e-5;
        }
        this.nullinger = this.ctx.createBufferSource();
        this.nullinger.buffer = buf;
        this.nullinger.connect(this.analyzer);
        this.nullinger.loop = 1;
        this.nullinger.start();
        
        // Connect
        this.analyzer.connect(this.master);
        this.master.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
        
    }
    
    /* API */
    
    this.add_source = function (s) {
        var p = this.load_sound_file(s.files, this.ctx);
        p.then((function (b) {
            s.buffer = b;
            s.gain = this.ctx.createGain();
            s.gain.connect(this.analyzer);
            s.player = this;
            if (!s.started && s.loop)
                s.gain.gain.value = 0;
        }).bind(this),
        function (err) {
            console.warn(err);
        });
        this.sources.push(s);
    }
    
    this.start = function () {
        for (var i = 0; i < this.sources.length; i++) {
            var s = this.sources[i]
            if (s.loop)
                this.run_source(s);
        }
        this.started = true;
    }
    this.stop = function () {
        for (var i = 0; i < this.sources.length; i++) {
            if (this.sources[i].loop)
                this.stop_source(this.sources[i]);
        }
        this.started = false;
    }
    this.get_analyzer = function (x, y) {
        this.analyzer.getFloatFrequencyData(this.a_data)
        var data = this.a_data;
        var result = [];
        var range = this.a_mindb - this.a_maxdb;
        y = y || 100;
        var step = (this.a_maxf10 - this.a_minf10) / x;
        var last = Math.round(((Math.pow(10, this.a_minf10) / this.a_maxf)) * this.a_maxs);
        for (var i = 0; i < x; i++) {
            var l = Math.round(((Math.pow(10, this.a_minf10 + (1 + i) * step) / this.a_maxf)) * this.a_maxs);
            var sum = 0;
            for (var j = last; j <= l; j++) {
                sum += Math.min(this.a_maxdb, Math.max(this.a_mindb, data[j]));
            }
            sum /= l - last;
            if (sum < this.a_mindb) sum = this.a_mindb;
            var res = Math.round((1 - ((sum - this.a_maxdb) / range)) * y);
            result.push(res);
            last = l;
        }
        return result;
    }
    
    this.set_filter = function (f) {
        this.filter.frequency.value = f;
    }
    
    this.set_master = function (v) {
        this.master.gain.value = v;
    }
    
    this.set_source = function (s, v) {
        if (s.loop) {
            if (s.gain)
                s.gain.gain.value = v ? 1 : 0;
            s.started = !!v;
        } else {
            //if (v) this.run_source(s);
            //else this.stop_source(s);
            this.run_source(s);
        }
        return s;
    }
    
    
    /* helpers */
    
    this.run_source = function (s) {
        s.source = this.ctx.createBufferSource();
        s.source.buffer = s.buffer;
        s.source.loop = s.loop;
        var last = s.source;
        if (s.fx) {
            for (var i = 0; i < s.fx.length; i++) {
                last.connect(this[s.fx[i]]);
                last = this[s.fx[i]];
            }
        }
        last.connect(s.gain);
        s.source.start(0);
        s.started = !!s.gain.gain.value;
    }
    this.stop_source = function (s) {
        s.source.stop();
        //s.started = false;
    }
    
    this.load_sound_file = function (url, ctx) {
        if (!url.length) {
            console.warn("giving up");
            return Promise.reject("Could not find any working codec.");
        }

        var load_file = function() {
            return new Promise(function (resolve, reject) {
                var request = new XMLHttpRequest();
    
                request.open('GET', url[0], true);
                request.responseType = 'arraybuffer';
    
                request.onload = function() {
                    if (this.status >= 200 && this.status < 300) {
                        resolve(this.response);
                    } else {
                        url = url.slice(1);
                        if (!url.length) reject(this.statusText);
                        else resolve(load_file());
                    }
                };
                request.onerror = function(err) {
                    console.warn('Could not load ', url[0], 'status:', this.statusText);
                    url = url.slice(1);
                    if (!url.length) reject(err);
                    else resolve(load_file());
                };
                request.send();
            });
        };
    
        return load_file().then(function(buffer) {
            return new Promise(function (resolve, reject) {
                ctx.decodeAudioData(buffer, function (buffer) {
                    resolve(buffer);
                }, function(error) {
                    console.warn('Could not decode file', url[0]);
                    resolve(load_sound_file(url.slice(1), ctx));
                });
            });
        });
    }
    
    /* initialize */
    this.init();
}


var UI = function () {
    
    this.init = function () {
        
        this.events = {
            "start" : document.createEvent("Event"),
            "stop" : document.createEvent("Event"),
        };
        this.events.start.initEvent("start", true, true);
        this.events.stop.initEvent("stop", true, true);
        
        this.node = element("div", {id:"player"}, document.body);
            
        this.toggle = element("div", {id:"toggle"}, this.node);
        this.toggle.onclick = (function (e) {
            if (this.node.classList.contains("started")) {
                this.node.classList.remove("started");
                this.node.dispatchEvent(this.events.stop);
            } else {
                this.node.classList.add("started");
                this.node.dispatchEvent(this.events.start);
            }
        }).bind(this);
        
        this.analyzer = element("div", {id : "analyzer"}, this.node);
        for (var i = 0; i < analyzer_strips; i++) {
            var s = element("div", { "class" : "strip" }, this.analyzer);
            for (var j = 0; j < analyzer_leds; j++) {
                var l = element("div", { "class" : "led" }, s);
            }
        }
    }
    
    this.add_source = function (s) {
        if (!this.sources) {
            this.sources = element("div", { id : "sources" }, this.node);
        }
        var b = element("div", {"class" : "source"}, this.sources);
        if (s.loop)
            b.classList.add("loop");
        else
            b.classList.add("oneshot");
        if (s.class)
            b.classList.add(s.class);
        s.button = b;
        return s;
    }
    
    this.set_source = function (s, v) {
        s.button.classList[ v ? "add" : "remove"]("started");
    }
    
    this.draw_analyzer = function (data) {
        for (var i = 0; i < data.length; i++) {
            var c = this.analyzer.children[i];
            var l = c.children.length;
            if (typeof data[i] == "object") {
                var k = Math.round((l - data[i].length) / 2);
                for (var j = 0; j < data[i].length; j++) {
                    c.children[j + k].classList[data[i][j] ? "add" : "remove"]("active");
                }
            } else {
                for (var j = 0; j < l; j++) {
                    c.children[l - j - 1].classList[data[i] > j ? "add" : "remove"]("active");
                }
            }
        }
    }
    
    this.add_knob = function (e) {
        e.element = element("div", { id : e.id, "class" : "knob" }, this.node);
        e.bar = element("div", { "class" : "bar" }, e.element);
    }
    
    this.set_knob = function (e, v) {
        e.bar.style.height = (v * 100) + "%";
    }
    
    this.init();
}

/* STUFF & TOOLS */

w.element = function (type, attrs, parent) {
    attrs = attrs || {};
    var e = document.createElement(type);
    for (var i in attrs)
        e.setAttribute(i, attrs[i]);
    if (parent)
        parent.appendChild(e);
    return e;
}

w.getID = function (id) {
    return document.getElementById(id);
}
w.screenWidth = function () {
    return Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
}
w.screenHeight = function () {
    return Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
}
function easeInOut (t, b, c, d) {
    return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
}

function hsv2css(h, s, v) {
    var r, g, b;
    var i = Math.floor(h * 6);
    var f = h * 6 - i;
    var p = v * (1 - s);
    var q = v * (1 - f * s);
    var t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return "rgb(" + parseInt(r * 255) + "," + parseInt(g * 255) + "," + parseInt(b * 255) + ")";
}

document.addEventListener("DOMContentLoaded", init);

})(this);
