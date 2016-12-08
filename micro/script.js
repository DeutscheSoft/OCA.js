var objects;

function bitstring_actuator(o, sensor) {
    var DIV = document.createElement("DIV");
    DIV.setAttribute("id", "ACTUATOR" + o.ObjectNumber);
    DIV.classList.add("BITSTRING");
    DIV.classList.add("ACTUATOR");

    o.GetNrBits().then(function(N) {
        var S;
        var update_state = function(cls, state) {
            S = state;
            for (var i = 0; i < S.length; i++) {
                B[i].classList.toggle(cls, state[i]);
            }
            network.add(S.length);
        };
        var update_actuator = update_state.bind(this, "true");
        var update_sensor = update_state.bind(this, "pressed");
        var B = [];
        for (var index = 0; index < N; index++) {
            var b = document.createElement("button");
            B[index] = b;

            b.addEventListener("click", function(index) {
                var state = this.classList.contains("true");
                o.SetBit(index, !state);
                network.add(1);
            }.bind(b, index));

            DIV.appendChild(b);
        }
        o.on_property_changed("Bitstring", update_actuator)
                .catch(function(err) { OCA.error("Subscription failed", err); });
        o.GetBitstring().then(update_actuator);
        if (sensor) {
            sensor.on_property_changed("BitString", update_sensor)
                .catch(function(err) { OCA.error("Subscription failed", err); });
            sensor.GetBitString().then(update_sensor);

        }
    });
    return DIV;
}
function int8_sensor(o) {
    var xmlns = "http://www.w3.org/2000/svg";
    var SVG = document.createElementNS (xmlns, "svg");
    SVG.setAttributeNS(null, "id", "SENSOR" + o.ObjectNumber);
    SVG.classList.add("INT8");
    SVG.classList.add("SENSOR");
    SVG.setAttributeNS(null, "viewBox", "0 0 100 100");
    
    var base = document.createElementNS(xmlns, "circle");
    base.classList.add("base");
    base.setAttributeNS(null, "cx", "50");
    base.setAttributeNS(null, "cy", "50");
    base.setAttributeNS(null, "r", "40");
    SVG.appendChild(base);
    
    var value = document.createElementNS(xmlns, "circle");
    value.classList.add("value");
    value.setAttributeNS(null, "cx", "50");
    value.setAttributeNS(null, "cy", "50");
    value.setAttributeNS(null, "r", "40");
    SVG.appendChild(value);
    
    var label = document.createElementNS(xmlns, "text");
    label.classList.add("label");
    label.setAttributeNS(null, "x", "50");
    label.setAttributeNS(null, "y", "55");
    label.setAttributeNS(null, "text-anchor", "middle");
    SVG.appendChild(label);
    
    var txt = document.createTextNode("");
    label.appendChild(txt);
    
    var update_reading = function(v) {
        var val = (v+128)/256;
        var pos = val*251.33;
        value.style["stroke-dasharray"] = (pos === 0) ? "2,1000" : ("0," + pos + ",1,1000");
        value.style["stroke"] = hsv2css(val, 1, 0.86);
        txt.textContent = parseInt(val * 360);
        network.add(1);
    }
    o.on_property_changed("Reading", update_reading).catch(function(err) { OCA.error("Subscription failed", err); });
    o.GetReading().then(update_reading);
    return SVG;
}

function onopen () {
    window.device = new OCA.RemoteDevice(new OCA.WebSocketConnection(ws));

    document.addEventListener('touchmove', function(e){
        e.preventDefault(); 
    });

    device.discover_all().then(function (res) {
        objects = res;
        window.objects = res;
        var text = 'Found '+objects.length+' Objects: \n';

        for (var i = 0; i < res.length; i++) {
            text += res[i].ClassName + ' with ObjectNumber ' + res[i].ObjectNumber + '\n';
        }

        document.getElementById('messages').innerHTML = text;

        var UI = document.getElementById("UI");

        for (var i = 0; i < objects.length; i++) {
            if (i == 11 || i == 14) continue;
            var o = objects[i];
            if (o instanceof OCA.ControlClasses.OcaBitstringActuator) {
                UI.appendChild(bitstring_actuator(o));
            } else if (o instanceof OCA.ControlClasses.OcaInt8Sensor) {
                UI.appendChild(int8_sensor(o));
            }
        }
        // special case, we display those together
        UI.appendChild(bitstring_actuator(objects[14], objects[11]));
    }).catch(function(res) { 
        console.error(res);
        document.getElementById('messages').innerHTML = res;
    });
    if(!objects) {
        document.getElementById('messages').innerHTML = "No devices found!";
    }
    document.body.classList.remove("loading");
    FastClick.attach(document.body);
    
    network.run();
};


function Network (items, timeout, parent) {
    this._to = -1;
    this.items = items;
    this.timeout = timeout;
    this.values = [];
    this.pointer = 0;
    this.value = 0;
    this.add = function (val) { this.value += val; }
    this.step = function () {
        //this.value = parseInt(Math.random() * 1000);
        if (this.pointer >= 50) {
            this.values = this.values.slice(1);
            this.values.push(this.value);
        }
        else this.values[this.pointer++] = this.value;
        this.value = 0;
        var max = Math.max.apply(Math, this.values);
        for (var i = 0; i < this.values.length; i++) {
            this.con.childNodes[i].style.height = (this.values[i] / max * 100) + "%";
        }
    }
    this.stop = function () {
        if (this._to >= 0)
            window.clearInterval(this._to);
    }
    this.run = function () {
        this.stop();
        this._to = window.setInterval(this.step.bind(this), this.timeout);
    }
    
    this.con = document.createElement("ul");
    this.con.setAttribute("id", "network");
    for (var i = 0; i < 50; i++) {
        this.con.appendChild(document.createElement("li"));
    }
    if (parent)
        parent.appendChild(this.con);
}

function init () {
    window.network = new Network(100, 250, document.body);
    window.ws = new WebSocket('ws://'+document.location.host);
    ws.onopen = onopen;
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
