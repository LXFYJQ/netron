
var grapher = {};
var dagre = require('./dagre');

grapher.Graph = class {

    constructor(compound, layout) {
        this._layout = layout;
        this._isCompound = compound;
        this._nodes = new Map();
        this._edges = new Map();
        this._children = {};
        this._children['\x00'] = {};
        this._parent = {};
    }

    setNode(node) {
        const key = node.name;
        const value = this._nodes.get(key);
        if (value) {
            value.label = node;
        } else {
            this._nodes.set(key, { v: key, label: node });
            if (this._isCompound) {
                this._parent[key] = '\x00';
                this._children[key] = {};
                this._children['\x00'][key] = true;
            }
        }
    }

    setEdge(edge) {
        if (!this._nodes.has(edge.v)) {
            throw new grapher.Error("Invalid edge '" + JSON.stringify(edge.v) + "'.");
        }
        if (!this._nodes.has(edge.w)) {
            throw new grapher.Error("Invalid edge '" + JSON.stringify(edge.w) + "'.");
        }
        const key = edge.v + ':' + edge.w;
        if (!this._edges.has(key)) {
            this._edges.set(key, { v: edge.v, w: edge.w, label: edge });
        }
    }

    setParent(node, parent) {
        if (!this._isCompound) {
            throw new Error("Cannot set parent in a non-compound graph");
        }
        parent += "";
        for (let ancestor = parent; ancestor; ancestor = this.parent(ancestor)) {
            if (ancestor === node) {
                throw new Error("Setting " + parent + " as parent of " + node + " would create a cycle");
            }
        }
        delete this._children[this._parent[node]][node];
        this._parent[node] = parent;
        this._children[parent][node] = true;
        return this;
    }

    get nodes() {
        return this._nodes;
    }

    hasNode(key) {
        return this._nodes.has(key);
    }

    node(key) {
        return this._nodes.get(key);
    }

    get edges() {
        return this._edges;
    }

    parent(key) {
        if (this._isCompound) {
            const parent = this._parent[key];
            if (parent !== '\x00') {
                return parent;
            }
        }
        return null;
    }

    children(key) {
        key = key === undefined ? '\x00' : key;
        if (this._isCompound) {
            const children = this._children[key];
            if (children) {
                return Object.keys(children);
            }
        } else if (key === '\x00') {
            return this.nodes.keys();
        } else if (this.hasNode(key)) {
            return [];
        }
        return null;
    }

    build(document, origin) {
        const createGroup = (name) => {
            const element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            element.setAttribute('id', name);
            element.setAttribute('class', name);
            origin.appendChild(element);
            return element;
        };

        const clusterGroup = createGroup('clusters');
        const edgePathGroup = createGroup('edge-paths');
        const edgeLabelGroup = createGroup('edge-labels');
        const nodeGroup = createGroup('nodes');

        const edgePathGroupDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        edgePathGroup.appendChild(edgePathGroupDefs);
        const marker = (id) => {
            const element = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            element.setAttribute('id', id);
            element.setAttribute('viewBox', '0 0 10 10');
            element.setAttribute('refX', 9);
            element.setAttribute('refY', 5);
            element.setAttribute('markerUnits', 'strokeWidth');
            element.setAttribute('markerWidth', 8);
            element.setAttribute('markerHeight', 6);
            element.setAttribute('orient', 'auto');
            const markerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            markerPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 L 4 5 z');
            markerPath.style.setProperty('stroke-width', 1);
            element.appendChild(markerPath);
            return element;
        };
        edgePathGroupDefs.appendChild(marker("arrowhead"));
        edgePathGroupDefs.appendChild(marker("arrowhead-select"));
        edgePathGroupDefs.appendChild(marker("arrowhead-hover"));
        for (const nodeId of this.nodes.keys()) {
            const entry = this.node(nodeId);
            const node = entry.label;
            if (this.children(nodeId).length == 0) {
                node.build(document, nodeGroup);
            } else {
                // cluster
                node.rectangle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                if (node.rx) {
                    node.rectangle.setAttribute('rx', entry.rx);
                }
                if (node.ry) {
                    node.rectangle.setAttribute('ry', entry.ry);
                }
                node.element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                node.element.setAttribute('class', 'cluster');
                node.element.appendChild(node.rectangle);
                clusterGroup.appendChild(node.element);
            }
        }

        for (const edge of this.edges.values()) {
            edge.label.build(document, edgePathGroup, edgeLabelGroup);
        }
    }

    measure() {
        for (const key of this.nodes.keys()) {
            const entry = this.node(key);
            if (this.children(key).length == 0) {
                const node = entry.label;
                node.measure();
            }
        }
    }

    layout() {
        dagre.layout(this, this._layout);
        for (const key of this.nodes.keys()) {
            const entry = this.node(key);
            if (this.children(key).length == 0) {
                const node = entry.label;
                node.layout();
            }
        }
    }

    update() {
        for (const nodeId of this.nodes.keys()) {
            if (this.children(nodeId).length == 0) {
                // node
                const entry = this.node(nodeId);
                const node = entry.label;
                node.update();
            } else {
                // cluster
                const entry = this.node(nodeId);
                const node = entry.label;
                node.element.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
                node.rectangle.setAttribute('x', - node.width / 2);
                node.rectangle.setAttribute('y', - node.height / 2);
                node.rectangle.setAttribute('width', node.width);
                node.rectangle.setAttribute('height', node.height);
            }
        }
        for (const edge of this.edges.values()) {
            edge.label.update();
        }
    }
};

grapher.Node = class {

    constructor() {
        this._blocks = [];
    }

    header() {
        const block = new grapher.Node.Header();
        this._blocks.push(block);
        return block;
    }

    list() {
        const block = new grapher.Node.List();
        this._blocks.push(block);
        return block;
    }

    canvas() {
        const block = new grapher.Node.Canvas();
        this._blocks.push(block);
        return block;
    }

    build(document, parent) {
        this.element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        if (this.id) {
            this.element.setAttribute('id', this.id);
        }
        this.element.setAttribute('class', this.class ? 'node ' + this.class : 'node');
        this.element.style.opacity = 0;
        parent.appendChild(this.element);
        this.border = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.border.setAttribute('class', 'node node-border');
        for (let i = 0; i < this._blocks.length; i++) {
            const block = this._blocks[i];
            block.first = i === 0;
            block.last = i === this._blocks.length - 1;
            block.build(document, this.element);
        }
        this.element.appendChild(this.border);
    }

    measure() {
        this.height = 0;
        for (const block of this._blocks) {
            block.measure();
            this.height = this.height + block.height;
        }
        this.width = Math.max(...this._blocks.map((block) => block.width));
        for (const block of this._blocks) {
            block.width = this.width;
        }
    }

    layout() {
        let y = 0;
        for (const block of this._blocks) {
            block.x = 0;
            block.y = y;
            block.width = this.width;
            block.layout();
            y += block.height;
        }
    }

    update() {
        for (const block of this._blocks) {
            block.update();
        }
        this.border.setAttribute('d', grapher.Node.roundedRect(0, 0, this.width, this.height, true, true, true, true));
        this.element.setAttribute('transform', 'translate(' + (this.x - (this.width / 2)) + ',' + (this.y - (this.height / 2)) + ')');
        this.element.style.removeProperty('opacity');
    }

    select() {
        if (this.element) {
            this.element.classList.add('select');
            return [ this.element ];
        }
        return [];
    }

    deselect() {
        if (this.element) {
            this.element.classList.remove('select');
        }
    }

    static roundedRect(x, y, width, height, r1, r2, r3, r4) {
        const radius = 5;
        r1 = r1 ? radius : 0;
        r2 = r2 ? radius : 0;
        r3 = r3 ? radius : 0;
        r4 = r4 ? radius : 0;
        return "M" + (x + r1) + "," + y +
            "h" + (width - r1 - r2) +
            "a" + r2 + "," + r2 + " 0 0 1 " + r2 + "," + r2 +
            "v" + (height - r2 - r3) +
            "a" + r3 + "," + r3 + " 0 0 1 " + -r3 + "," + r3 +
            "h" + (r3 + r4 - width) +
            "a" + r4 + "," + r4 + " 0 0 1 " + -r4 + "," + -r4 +
            'v' + (-height + r4 + r1) +
            "a" + r1 + "," + r1 + " 0 0 1 " + r1 + "," + -r1 +
            "z";
    }
};

grapher.Node.Header = class {

    constructor() {
        this._entries = [];
    }

    add(id, classList, content, tooltip, handler) {
        const entry = new grapher.Node.Header.Entry(id, classList, content, tooltip, handler);
        this._entries.push(entry);
        return entry;
    }

    build(document, parent) {
        this._document = document;
        for (const entry of this._entries) {
            entry.build(document, parent);
        }
        if (!this.first) {
            this.line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            parent.appendChild(this.line);
        }
        for (let i = 0; i < this._entries.length; i++) {
            const entry = this._entries[i];
            if (i != 0) {
                entry.line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                parent.appendChild(entry.line);
            }
        }
    }

    measure() {
        this.width = 0;
        this.height = 0;
        for (const entry of this._entries) {
            entry.measure();
            this.height = Math.max(this.height, entry.height);
            this.width += entry.width;
        }
    }

    layout() {
        let x = this.width;
        for (let i = this._entries.length - 1; i >= 0; i--) {
            const entry = this._entries[i];
            if (i > 0) {
                x -= entry.width;
                entry.x = x;
            } else {
                entry.x = 0;
                entry.width = x;
            }
        }
    }

    update() {
        for (let i = 0; i < this._entries.length; i++) {
            const entry = this._entries[i];
            entry.element.setAttribute('transform', 'translate(' + entry.x + ',' + this.y + ')');
            const r1 = i == 0 && this.first;
            const r2 = i == this._entries.length - 1 && this.first;
            const r3 = i == this._entries.length - 1 && this.last;
            const r4 = i == 0 && this.last;
            entry.path.setAttribute('d', grapher.Node.roundedRect(0, 0, entry.width, entry.height, r1, r2, r3, r4));
            entry.text.setAttribute('x', 6);
            entry.text.setAttribute('y', entry.ty);
        }
        for (let i = 1; i < this._entries.length; i++) {
            const entry = this._entries[i];
            const line = entry.line;
            line.setAttribute('class', 'node');
            line.setAttribute('x1', entry.x);
            line.setAttribute('x2', entry.x);
            line.setAttribute('y1', this.y);
            line.setAttribute('y2', this.y + this.height);
        }
        if (this.line) {
            this.line.setAttribute('class', 'node');
            this.line.setAttribute('x1', 0);
            this.line.setAttribute('x2', this.width);
            this.line.setAttribute('y1', this.y);
            this.line.setAttribute('y2', this.y);
        }
    }
};

grapher.Node.Header.Entry = class {

    constructor(id, classList, content, tooltip, handler) {
        this.id = id;
        this.classList = classList;
        this.content = content;
        this.tooltip = tooltip;
        this.handler = handler;
        this._events = {};
    }

    on(event, callback) {
        this._events[event] = this._events[event] || [];
        this._events[event].push(callback);
    }

    emit(event, data) {
        if (this._events && this._events[event]) {
            for (const callback of this._events[event]) {
                callback(this, data);
            }
        }
    }

    build(document, parent) {
        this.element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        parent.appendChild(this.element);
        this.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        this.element.appendChild(this.path);
        this.element.appendChild(this.text);
        const classList = [ 'node-item' ];
        if (this.classList) {
            classList.push(...this.classList);
        }
        this.element.setAttribute('class', classList.join(' '));
        if (this.id) {
            this.element.setAttribute('id', this.id);
        }
        if (this._events.click) {
            this.element.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('click');
            });
        }
        if (this.tooltip) {
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = this.tooltip;
            this.element.appendChild(title);
        }
        this.text.textContent = this.content || '\u00A0';
    }

    measure() {
        const yPadding = 4;
        const xPadding = 7;
        const boundingBox = this.text.getBBox();
        this.width = boundingBox.width + xPadding + xPadding;
        this.height = boundingBox.height + yPadding + yPadding;
        this.tx = xPadding;
        this.ty = yPadding - boundingBox.y;
    }

    layout() {
    }
};

grapher.Node.List = class {

    constructor() {
        this._items = [];
        this._events = {};
    }

    add(name, value, tooltip, separator) {
        const item = new grapher.Node.List.Item(name, value, tooltip, separator);
        this._items.push(item);
        return item;
    }

    on(event, callback) {
        this._events[event] = this._events[event] || [];
        this._events[event].push(callback);
    }

    emit(event, data) {
        if (this._events && this._events[event]) {
            for (const callback of this._events[event]) {
                callback(this, data);
            }
        }
    }

    build(document, parent) {
        this._document = document;
        this.element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.element.setAttribute('class', 'node-attribute-list');
        if (this._events.click) {
            this.element.addEventListener('click', (e) => {
                e.stopPropagation();
                this.emit('click');
            });
        }
        this.background = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.element.appendChild(this.background);
        parent.appendChild(this.element);
        for (const item of this._items) {
            const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.setAttribute('class', 'node-attribute');
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('xml:space', 'preserve');
            if (item.tooltip) {
                const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                title.textContent = item.tooltip;
                text.appendChild(title);
            }
            const colon = item.type === 'node' || item.type === 'node[]';
            const name = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            name.textContent =  colon ? item.name + ':' : item.name;
            if (item.separator.trim() !== '=' && !colon) {
                name.style.fontWeight = 'bold';
            }
            text.appendChild(name);
            group.appendChild(text);
            this.element.appendChild(group);
            item.group = group;
            item.text = text;
            if (item.type === 'node') {
                const node = item.value;
                node.build(document, item.group);
            } else if (item.type === 'node[]') {
                for (const node of item.value) {
                    node.build(document, item.group);
                }
            } else {
                const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                tspan.textContent = item.separator + item.value;
                item.text.appendChild(tspan);
            }
        }
        if (!this.first) {
            this.line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            this.line.setAttribute('class', 'node');
            this.element.appendChild(this.line);
        }
    }

    measure() {
        this.width = 75;
        this.height = 3;
        const yPadding = 1;
        const xPadding = 6;
        for (let i = 0; i < this._items.length; i++) {
            const item = this._items[i];
            const size = item.text.getBBox();
            item.width = xPadding + size.width + xPadding;
            item.height = yPadding + size.height + yPadding;
            item.offset = size.y;
            this.height += item.height;
            if (item.type === 'node') {
                const node = item.value;
                node.measure();
                this.width = Math.max(150, this.width, node.width + (2 * xPadding));
                this.height += node.height + yPadding + yPadding + yPadding + yPadding;
                if (i === this._items.length - 1) {
                    this.height += 3;
                }
            } else if (item.type === 'node[]') {
                for (const node of item.value) {
                    node.measure();
                    this.width = Math.max(150, this.width, node.width + (2 * xPadding));
                    this.height += node.height + yPadding + yPadding + yPadding + yPadding;
                }
                if (i === this._items.length - 1) {
                    this.height += 3;
                }
            }
            this.width = Math.max(this.width, item.width);
        }
        this.height += 3;
    }

    layout() {
        const yPadding = 1;
        const xPadding = 6;
        let y = 3;
        for (const item of this._items) {
            item.x = this.x + xPadding;
            item.y = y + yPadding - item.offset;
            y += item.height;
            if (item.type === 'node') {
                const node = item.value;
                node.width = this.width - xPadding - xPadding;
                node.layout();
                node.x = this.x + xPadding + (node.width / 2);
                node.y = y + (node.height / 2) + yPadding + yPadding;
                y += node.height + yPadding + yPadding + yPadding + yPadding;
            } else if (item.type === 'node[]') {
                for (const node of item.value) {
                    node.width = this.width - xPadding - xPadding;
                    node.layout();
                    node.x = this.x + xPadding + (node.width / 2);
                    node.y = y + (node.height / 2) + yPadding + yPadding;
                    y += node.height + yPadding + yPadding + yPadding + yPadding;
                }
            }
        }
    }

    update() {
        this.element.setAttribute('transform', 'translate(' + this.x + ',' + this.y + ')');
        this.background.setAttribute('d', grapher.Node.roundedRect(0, 0, this.width, this.height, this.first, this.first, this.last, this.last));
        for (const item of this._items) {
            const text = item.text;
            text.setAttribute('x', item.x);
            text.setAttribute('y', item.y);
            if (item.type === 'node') {
                const node = item.value;
                node.update();
            } else if (item.type === 'node[]') {
                for (const node of item.value) {
                    node.update();
                }
            }
        }
        if (this.line) {
            this.line.setAttribute('x1', 0);
            this.line.setAttribute('x2', this.width);
            this.line.setAttribute('y1', 0);
            this.line.setAttribute('y2', 0);
        }
        for (const item of this._items) {
            if (item.value instanceof grapher.Node) {
                const node = item.value;
                node.update();
            }
        }
    }
};

grapher.Node.List.Item = class {

    constructor(name, value, tooltip, separator) {
        this.name = name;
        this.value = value;
        this.tooltip = tooltip;
        this.separator = separator;
        if (value instanceof grapher.Node) {
            this.type = 'node';
        } else if (Array.isArray(value) && value.every((value) => value instanceof grapher.Node)) {
            this.type = 'node[]';
        }
    }
};

grapher.Node.Canvas = class {

    constructor() {
        this.width = 0;
        this.height = 80;
    }

    build(/* document, parent */) {
    }

    update(/* parent, top, width , first, last */) {
    }
};

grapher.Edge = class {

    constructor(from, to) {
        this.from = from;
        this.to = to;
    }

    build(document, edgePathGroupElement, edgeLabelGroupElement) {
        const createElement = (name) => {
            return document.createElementNS('http://www.w3.org/2000/svg', name);
        };
        this.element = createElement('path');
        if (this.id) {
            this.element.setAttribute('id', this.id);
        }
        this.element.setAttribute('class', this.class ? 'edge-path ' + this.class : 'edge-path');
        edgePathGroupElement.appendChild(this.element);
        this.hitTest = createElement('path');
        this.hitTest.setAttribute('class', 'edge-path-hit-test');
        this.hitTest.addEventListener('pointerover', () => this.emit('pointerover'));
        this.hitTest.addEventListener('pointerleave', () => this.emit('pointerleave'));
        this.hitTest.addEventListener('click', () => this.emit('click'));
        edgePathGroupElement.appendChild(this.hitTest);
        if (this.label) {
            const tspan = createElement('tspan');
            tspan.setAttribute('xml:space', 'preserve');
            tspan.setAttribute('dy', '1em');
            tspan.setAttribute('x', '1');
            tspan.appendChild(document.createTextNode(this.label));
            this.labelElement = createElement('text');
            this.labelElement.appendChild(tspan);
            this.labelElement.style.opacity = 0;
            this.labelElement.setAttribute('class', 'edge-label');
            if (this.id) {
                this.labelElement.setAttribute('id', 'edge-label-' + this.id);
            }
            edgeLabelGroupElement.appendChild(this.labelElement);
            const edgeBox = this.labelElement.getBBox();
            this.width = edgeBox.width;
            this.height = edgeBox.height;
        }
    }

    update() {
        const intersectRect = (node, point) => {
            const x = node.x;
            const y = node.y;
            const dx = point.x - x;
            const dy = point.y - y;
            let h = node.height / 2;
            let w = node.width / 2;
            if (Math.abs(dy) * w > Math.abs(dx) * h) {
                if (dy < 0) {
                    h = -h;
                }
                return { x: x + (dy === 0 ? 0 : h * dx / dy), y: y + h };
            }
            if (dx < 0) {
                w = -w;
            }
            return { x: x + w, y: y + (dx === 0 ? 0 : w * dy / dx) };
        };
        const curvePath = (edge, tail, head) => {
            const points = edge.points.slice(1, edge.points.length - 1);
            points.unshift(intersectRect(tail, points[0]));
            points.push(intersectRect(head, points[points.length - 1]));
            return new grapher.Edge.Curve(points).path.data;
        };
        const edgePath = curvePath(this, this.from, this.to);
        this.element.setAttribute('d', edgePath);
        this.hitTest.setAttribute('d', edgePath);
        if (this.labelElement) {
            this.labelElement.setAttribute('transform', 'translate(' + (this.x - (this.width / 2)) + ',' + (this.y - (this.height / 2)) + ')');
            this.labelElement.style.opacity = 1;
        }
    }

    select() {
        if (this.element) {
            if (!this.element.classList.contains('select')) {
                const path = this.element;
                path.classList.add('select');
                this.element = path.cloneNode(true);
                path.parentNode.replaceChild(this.element, path);
            }
            return [ this.element ];
        }
        return [];
    }

    deselect() {
        if (this.element && this.element.classList.contains('select')) {
            const path = this.element;
            path.classList.remove('select');
            this.element = path.cloneNode(true);
            path.parentNode.replaceChild(this.element, path);
        }
    }
};

grapher.Edge.Curve = class {

    constructor(points) {
        this._path = new grapher.Edge.Path();
        this._x0 = NaN;
        this._x1 = NaN;
        this._y0 = NaN;
        this._y1 = NaN;
        this._state = 0;
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            this.point(point.x, point.y);
            if (i === points.length - 1) {
                switch (this._state) {
                    case 3:
                        this.curve(this._x1, this._y1);
                        this._path.lineTo(this._x1, this._y1);
                        break;
                    case 2:
                        this._path.lineTo(this._x1, this._y1);
                        break;
                    default:
                        break;
                }
                if (this._line || (this._line !== 0 && this._point === 1)) {
                    this._path.closePath();
                }
                this._line = 1 - this._line;
            }
        }
    }

    get path() {
        return this._path;
    }

    point(x, y) {
        x = +x;
        y = +y;
        switch (this._state) {
            case 0:
                this._state = 1;
                if (this._line) {
                    this._path.lineTo(x, y);
                } else {
                    this._path.moveTo(x, y);
                }
                break;
            case 1:
                this._state = 2;
                break;
            case 2:
                this._state = 3;
                this._path.lineTo((5 * this._x0 + this._x1) / 6, (5 * this._y0 + this._y1) / 6);
                this.curve(x, y);
                break;
            default:
                this.curve(x, y);
                break;
        }
        this._x0 = this._x1;
        this._x1 = x;
        this._y0 = this._y1;
        this._y1 = y;
    }

    curve(x, y) {
        this._path.bezierCurveTo(
            (2 * this._x0 + this._x1) / 3,
            (2 * this._y0 + this._y1) / 3,
            (this._x0 + 2 * this._x1) / 3,
            (this._y0 + 2 * this._y1) / 3,
            (this._x0 + 4 * this._x1 + x) / 6,
            (this._y0 + 4 * this._y1 + y) / 6
        );
    }
};

grapher.Edge.Path = class {

    constructor() {
        this._x0 = null;
        this._y0 = null;
        this._x1 = null;
        this._y1 = null;
        this._data = '';
    }

    moveTo(x, y) {
        this._data += "M" + (this._x0 = this._x1 = +x) + "," + (this._y0 = this._y1 = +y);
    }

    lineTo(x, y) {
        this._data += "L" + (this._x1 = +x) + "," + (this._y1 = +y);
    }

    bezierCurveTo(x1, y1, x2, y2, x, y) {
        this._data += "C" + (+x1) + "," + (+y1) + "," + (+x2) + "," + (+y2) + "," + (this._x1 = +x) + "," + (this._y1 = +y);
    }

    closePath() {
        if (this._x1 !== null) {
            this._x1 = this._x0;
            this._y1 = this._y0;
            this._data += "Z";
        }
    }

    get data() {
        return this._data;
    }
};

if (typeof module !== 'undefined' && typeof module.exports === 'object') {
    module.exports.Graph = grapher.Graph;
    module.exports.Node = grapher.Node;
    module.exports.Edge = grapher.Edge;
}