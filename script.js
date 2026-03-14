'use strict';

/* ═══════════════════════════════════════════════════════════
   1. PARTICLE CANVAS BACKGROUND
═══════════════════════════════════════════════════════════ */
(function initParticles() {
    const mouse = { x: -999, y: -999 };

    // Consolidate mouse tracking - ALWAYS ACTIVE even if canvas is missing
    window.addEventListener('mousemove', e => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        if (window.onGlobalMouse) window.onGlobalMouse(e);
    }, { passive: true });

    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W, H, particles = [];
    const COUNT = 30; // Aggressively reduced for max smoothness
    const COLORS = ['rgba(79,172,254,', 'rgba(167,139,250,', 'rgba(118,228,247,'];

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }

    class Particle {
        constructor() { this.reset(true); }
        reset(init = false) {
            this.x = Math.random() * W;
            this.y = init ? Math.random() * H : H + 10;
            this.r = Math.random() * 1.8 + 0.4;
            this.vx = (Math.random() - 0.5) * 0.25;
            this.vy = -(Math.random() * 0.4 + 0.1);
            this.alpha = Math.random() * 0.5 + 0.1;
            this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        }
        update() {
            // Mouse repulsion
            const dx = this.x - mouse.x;
            const dy = this.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 100) {
                this.vx += (dx / dist) * 0.08;
                this.vy += (dy / dist) * 0.08;
            }
            this.x += this.vx;
            this.y += this.vy;
            this.vx *= 0.99;
            this.vy *= 0.99;
            if (this.y < -10 || this.x < -10 || this.x > W + 10) this.reset();
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fillStyle = `${this.color}${this.alpha})`;
            ctx.fill();
        }
    }

    function init() {
        particles = Array.from({ length: COUNT }, () => new Particle());
    }

    // Draw connecting lines removed as per request to declutter the header area
    function drawConnections() {
        // No-op
    }

    let isScrolling = false;
    let scrollTimeout;
    window.addEventListener('scroll', () => {
        isScrolling = true;
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => { isScrolling = false; }, 150);
    }, { passive: true });

    function loop() {
        ctx.clearRect(0, 0, W, H);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(loop);
    }

    window.addEventListener('resize', () => { resize(); init(); });

    resize();
    init();
    loop();
})();

/* ═══════════════════════════════════════════════════════════
   2. SPLASH CURSOR (Premium Fluid Dynamics)
═══════════════════════════════════════════════════════════ */
(function initSplashCursor() {
    const canvas = document.getElementById('fluid');
    if (!canvas) return;

    // Aggressive Performance Mode
    const config = {
        SIM_RESOLUTION: 32,          // Ultra-low for extreme smoothness
        DYE_RESOLUTION: 512,         // Lower resolution for better fill-rate
        CAPTURE_RESOLUTION: 256,
        DENSITY_DISSIPATION: 3.5,
        VELOCITY_DISSIPATION: 2,
        PRESSURE: 0.1,
        PRESSURE_ITERATIONS: 6,      // Extreme reduction for CPU/GPU breathing room
        CURL: 3,
        SPLAT_RADIUS: 0.2,
        SPLAT_FORCE: 6000,
        SHADING: true,
        COLOR_UPDATE_SPEED: 10,
        PAUSED: false,
        BACK_COLOR: { r: 0.5, g: 0, b: 0 },
        TRANSPARENT: true
    };

    function pointerPrototype() {
        this.id = -1;
        this.texcoordX = 0;
        this.texcoordY = 0;
        this.prevTexcoordX = 0;
        this.prevTexcoordY = 0;
        this.deltaX = 0;
        this.deltaY = 0;
        this.down = false;
        this.moved = false;
        this.color = [0, 0, 0];
    }

    let pointers = [new pointerPrototype()];

    function getWebGLContext(canvas) {
        const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
        let gl = canvas.getContext('webgl2', params);
        const isWebGL2 = !!gl;
        if (!isWebGL2) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

        let halfFloat, supportLinearFiltering;
        if (isWebGL2) {
            gl.getExtension('EXT_color_buffer_float');
            supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
        } else {
            halfFloat = gl.getExtension('OES_texture_half_float');
            supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
        }
        gl.clearColor(0.0, 0.0, 0.0, 1.0);

        const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : (halfFloat && halfFloat.HALF_FLOAT_OES);
        let formatRGBA, formatRG, formatR;

        function supportRenderTextureFormat(gl, internalFormat, format, type) {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        }

        function getSupportedFormat(gl, internalFormat, format, type) {
            if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
                switch (internalFormat) {
                    case gl.R16F: return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
                    case gl.RG16F: return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
                    default: return null;
                }
            }
            return { internalFormat, format };
        }

        if (isWebGL2) {
            formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
            formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
            formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
        } else {
            formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
            formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
            formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
        }

        return { gl, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } };
    }

    const { gl, ext } = getWebGLContext(canvas);
    if (!gl) return;

    if (!ext.supportLinearFiltering) {
        config.DYE_RESOLUTION = 256;
        config.SHADING = false;
    }

    function createProgram(vertexShader, fragmentShader) {
        let program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        return program;
    }

    function getUniforms(program) {
        let uniforms = [];
        let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniformCount; i++) {
            let name = gl.getActiveUniform(program, i).name;
            uniforms[name] = gl.getUniformLocation(program, name);
        }
        return uniforms;
    }

    function compileShader(type, source, keywords) {
        if (keywords) {
            let kwStr = '';
            keywords.forEach(k => { kwStr += '#define ' + k + '\n'; });
            source = kwStr + source;
        }
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(shader));
        return shader;
    }

    const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
        precision highp float;
        attribute vec2 aPosition;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform vec2 texelSize;
        void main () {
            vUv = aPosition * 0.5 + 0.5;
            vL = vUv - vec2(texelSize.x, 0.0);
            vR = vUv + vec2(texelSize.x, 0.0);
            vT = vUv + vec2(0.0, texelSize.y);
            vB = vUv - vec2(0.0, texelSize.y);
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
    `);

    const copyShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        varying highp vec2 vUv;
        uniform sampler2D uTexture;
        void main () { gl_FragColor = texture2D(uTexture, vUv); }
    `);

    const clearShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        varying highp vec2 vUv;
        uniform sampler2D uTexture;
        uniform float value;
        void main () { gl_FragColor = value * texture2D(uTexture, vUv); }
    `);

    const displayShaderSource = `
        precision highp float;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uTexture;
        uniform vec2 texelSize;
        void main () {
            vec3 c = texture2D(uTexture, vUv).rgb;
            #ifdef SHADING
                vec3 lc = texture2D(uTexture, vL).rgb;
                vec3 rc = texture2D(uTexture, vR).rgb;
                vec3 tc = texture2D(uTexture, vT).rgb;
                vec3 bc = texture2D(uTexture, vB).rgb;
                float dx = length(rc) - length(lc);
                float dy = length(tc) - length(bc);
                vec3 n = normalize(vec3(dx, dy, length(texelSize)));
                vec3 l = vec3(0.0, 0.0, 1.0);
                float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
                c *= diffuse;
            #endif
            gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
        }
    `;

    const splatShader = compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTarget;
        uniform float aspectRatio;
        uniform vec3 color;
        uniform vec2 point;
        uniform float radius;
        void main () {
            vec2 p = vUv - point.xy;
            p.x *= aspectRatio;
            vec3 splat = exp(-dot(p, p) / radius) * color;
            vec3 base = texture2D(uTarget, vUv).xyz;
            gl_FragColor = vec4(base + splat, 1.0);
        }
    `);

    const advectionShader = compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform sampler2D uSource;
        uniform vec2 texelSize;
        uniform vec2 dyeTexelSize;
        uniform float dt;
        uniform float dissipation;

        vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
            vec2 st = uv / tsize - 0.5;
            vec2 iuv = floor(st);
            vec2 fuv = fract(st);
            vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
            vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
            vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
            vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
            return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
        }

        void main () {
            #ifdef MANUAL_FILTERING
                vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
                vec4 result = bilerp(uSource, coord, dyeTexelSize);
            #else
                vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
                vec4 result = texture2D(uSource, coord);
            #endif
            gl_FragColor = result / (1.0 + dissipation * dt);
        }
    `, ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']);

    const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uVelocity;
        void main () {
            float L = texture2D(uVelocity, vL).x;
            float R = texture2D(uVelocity, vR).x;
            float T = texture2D(uVelocity, vT).y;
            float B = texture2D(uVelocity, vB).y;
            vec2 C = texture2D(uVelocity, vUv).xy;
            if (vL.x < 0.0) { L = -C.x; }
            if (vR.x > 1.0) { R = -C.x; }
            if (vT.y > 1.0) { T = -C.y; }
            if (vB.y < 0.0) { B = -C.y; }
            gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
        }
    `);

    const curlShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uVelocity;
        void main () {
            float L = texture2D(uVelocity, vL).y;
            float R = texture2D(uVelocity, vR).y;
            float T = texture2D(uVelocity, vT).x;
            float B = texture2D(uVelocity, vB).x;
            gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
        }
    `);

    const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `
        precision highp float;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;
        uniform sampler2D uCurl;
        uniform float curl;
        uniform float dt;
        void main () {
            float L = texture2D(uCurl, vL).x;
            float R = texture2D(uCurl, vR).x;
            float T = texture2D(uCurl, vT).x;
            float B = texture2D(uCurl, vB).x;
            float C = texture2D(uCurl, vUv).x;
            vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
            force /= length(force) + 0.0001;
            force *= curl * C;
            force.y *= -1.0;
            gl_FragColor = vec4(texture2D(uVelocity, vUv).xy + force * dt, 0.0, 1.0);
        }
    `);

    const pressureShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uDivergence;
        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            float div = texture2D(uDivergence, vUv).x;
            gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
        }
    `);

    const gradienSubtractShader = compileShader(gl.FRAGMENT_SHADER, `
        precision mediump float;
        varying highp vec2 vUv;
        varying highp vec2 vL;
        varying highp vec2 vR;
        varying highp vec2 vT;
        varying highp vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uVelocity;
        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            gl_FragColor = vec4(texture2D(uVelocity, vUv).xy - vec2(R - L, T - B), 0.0, 1.0);
        }
    `);

    class Program {
        constructor(vs, fs) { this.program = createProgram(vs, fs); this.uniforms = getUniforms(this.program); }
        bind() { gl.useProgram(this.program); }
    }

    const copyProgram = new Program(baseVertexShader, copyShader);
    const clearProgram = new Program(baseVertexShader, clearShader);
    const splatProgram = new Program(baseVertexShader, splatShader);
    const advectionProgram = new Program(baseVertexShader, advectionShader);
    const divergenceProgram = new Program(baseVertexShader, divergenceShader);
    const curlProgram = new Program(baseVertexShader, curlShader);
    const vorticityProgram = new Program(baseVertexShader, vorticityShader);
    const pressureProgram = new Program(baseVertexShader, pressureShader);
    const gradienSubtractProgram = new Program(baseVertexShader, gradienSubtractShader);

    class Material {
        constructor(vs, fs) { this.vs = vs; this.fs = fs; this.programs = {}; }
        setKeywords(keywords) {
            let key = keywords.sort().join(',');
            if (!this.programs[key]) this.programs[key] = new Program(this.vs, compileShader(gl.FRAGMENT_SHADER, this.fs, keywords));
            this.active = this.programs[key];
        }
        bind() { this.active.bind(); }
    }
    const displayMaterial = new Material(baseVertexShader, displayShaderSource);

    function createFBO(w, h, internalFormat, format, type, param) {
        gl.activeTexture(gl.TEXTURE0);
        let texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
        let fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        return { texture, fbo, width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; } };
    }

    function createDoubleFBO(w, h, internalFormat, format, type, param) {
        let f1 = createFBO(w, h, internalFormat, format, type, param), f2 = createFBO(w, h, internalFormat, format, type, param);
        return { width: w, height: h, texelSizeX: f1.texelSizeX, texelSizeY: f1.texelSizeY, get read() { return f1; }, set read(v) { f1 = v; }, get write() { return f2; }, set write(v) { f2 = v; }, swap() { let t = f1; f1 = f2; f2 = t; } };
    }

    let dye, velocity, divergence, curl, pressure;
    function getResolution(resolution) {
        let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspect < 1) aspect = 1 / aspect;
        let min = Math.round(resolution), max = Math.round(resolution * aspect);
        return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
    }

    function initFramebuffers() {
        let simRes = getResolution(config.SIM_RESOLUTION), dyeRes = getResolution(config.DYE_RESOLUTION);
        const t = ext.halfFloatTexType, rgba = ext.formatRGBA, rg = ext.formatRG, r = ext.formatR;
        const filter = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
        dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, t, filter);
        velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, t, filter);
        divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, t, gl.NEAREST);
        curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, t, gl.NEAREST);
        pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, t, gl.NEAREST);
    }

    const blit = (target) => {
        if (target == null) { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
        else { gl.viewport(0, 0, target.width, target.height); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initFramebuffers();
    }
    window.addEventListener('resize', resize);
    resize();

    function generateColor() {
        const h = Math.random(), s = 1.0, v = 1.0;
        let r, g, b, i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
        switch (i % 6) { case 0: r = v, g = t, b = p; break; case 1: r = q, g = v, b = p; break; case 2: r = p, g = v, b = t; break; case 3: r = p, g = q, b = v; break; case 4: r = t, g = p, b = v; break; case 5: r = v, g = p, b = q; break; }
        return { r: r * 0.15, g: g * 0.15, b: b * 0.15 };
    }

    function splatPointer(p) {
        let dx = p.deltaX * config.SPLAT_FORCE, dy = p.deltaY * config.SPLAT_FORCE;
        splatProgram.bind();
        gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
        gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.uniform2f(splatProgram.uniforms.point, p.texcoordX, p.texcoordY);
        gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0);
        gl.uniform1f(splatProgram.uniforms.radius, (config.SPLAT_RADIUS / 100) * (canvas.width / canvas.height > 1 ? canvas.width / canvas.height : 1));
        blit(velocity.write); velocity.swap();
        gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
        gl.uniform3f(splatProgram.uniforms.color, p.color.r, p.color.g, p.color.b);
        blit(dye.write); dye.swap();
    }

    let lastTime = Date.now(), colorTimer = 0, frameCount = 0;
    // Priority mode: Pause background fluid when Work Gallery is visible to save GPU
    let isWorkVisible = false, isVisible = true;
    const workObserver = new IntersectionObserver(([e]) => { isWorkVisible = e.isIntersecting; }, { threshold: 0.1 });
    const workSection = document.getElementById('work');
    if (workSection) workObserver.observe(workSection);

    const mainObserver = new IntersectionObserver(([e]) => {
        const wasVisible = isVisible;
        isVisible = e.isIntersecting;
        if (isVisible && !wasVisible) { lastTime = Date.now(); requestAnimationFrame(update); }
    }, { threshold: 0.05 });
    mainObserver.observe(canvas);

    function update() {
        frameCount++;
        let dt = Math.min((Date.now() - lastTime) / 1000, 0.016); lastTime = Date.now();
        gl.disable(gl.BLEND);

        if (frameCount % 2 === 0) {
            curlProgram.bind();
            gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
            blit(curl);

            vorticityProgram.bind();
            gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
            gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
            gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
            gl.uniform1f(vorticityProgram.uniforms.dt, dt * 2);
            blit(velocity.write); velocity.swap();

            divergenceProgram.bind();
            gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
            blit(divergence);

            clearProgram.bind();
            gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
            gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
            blit(pressure.write); pressure.swap();

            pressureProgram.bind();
            gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
            for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) { gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1)); blit(pressure.write); pressure.swap(); }

            gradienSubtractProgram.bind();
            gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
            gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
            blit(velocity.write); velocity.swap();

            advectionProgram.bind();
            gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
            let vid = velocity.read.attach(0);
            gl.uniform1i(advectionProgram.uniforms.uVelocity, vid);
            gl.uniform1i(advectionProgram.uniforms.uSource, vid);
            gl.uniform1f(advectionProgram.uniforms.dt, dt * 2);
            gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
            blit(velocity.write); velocity.swap();

            if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
            gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
            gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
            gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
            blit(dye.write); dye.swap();
        }

        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.BLEND);
        displayMaterial.setKeywords(config.SHADING ? ['SHADING'] : []);
        displayMaterial.bind();
        if (config.SHADING) gl.uniform2f(displayMaterial.active.uniforms.texelSize, 1 / canvas.width, 1 / canvas.height);
        gl.uniform1i(displayMaterial.active.uniforms.uTexture, dye.read.attach(0));
        blit(null);

        if (isVisible && !is3DHovered && !isWorkVisible) {
            requestAnimationFrame(update);
        }
    }        // Interaction-driven Prioritization: Pause fluid when 3D is hovered
    const interactiveCards = document.querySelectorAll('.project-card--interactive');
    let is3DHovered = false;
    interactiveCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            is3DHovered = true;
            document.body.classList.add('is-interacting-3d');
        });
        card.addEventListener('mouseleave', () => {
            is3DHovered = false;
            document.body.classList.remove('is-interacting-3d');
        });
    });

    const core = document.getElementById('cursor-core');

    // Zero-lag Direct positioning
    function updateCursorPosition(x, y) {
        if (core) {
            core.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        }
    }

    function updatePointer(e) {
        let p = pointers[0];
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);

        if (x === undefined || y === undefined) return;

        // INSTANT CURSOR MOVE
        updateCursorPosition(x, y);

        if (core) {
            core.style.opacity = e.type.startsWith('touch') ? '0' : '1';
        }

        p.prevTexcoordX = p.texcoordX; p.prevTexcoordY = p.texcoordY;
        p.texcoordX = x / canvas.width; p.texcoordY = 1 - y / canvas.height;
        p.deltaX = p.texcoordX - p.prevTexcoordX; p.deltaY = p.texcoordY - p.prevTexcoordY;

        if (!is3DHovered && isVisible && (Math.abs(p.deltaX) > 0 || Math.abs(p.deltaY) > 0)) {
            p.color = generateColor();
            splatPointer(p);
        }
    }

    // Attach to consolidated listener
    window.onGlobalMouse = (e) => updatePointer(e);
    window.addEventListener('touchstart', updatePointer, { passive: true });
    window.addEventListener('touchmove', updatePointer, { passive: true });

    window.addEventListener('mousedown', () => core && core.classList.add('clicking'));
    window.addEventListener('mouseup', () => core && core.classList.remove('clicking'));

    // Grow on hoverable elements (mostly for desktop)
    const hoverables = 'a, button, .skill-tag, .project-card, .social-link, .nav__logo';
    document.querySelectorAll(hoverables).forEach(el => {
        el.addEventListener('mouseenter', () => core && core.classList.add('clicking'));
        el.addEventListener('mouseleave', () => core && core.classList.remove('clicking'));
    });

    update();
})();

/* ═══════════════════════════════════════════════════════════
   2.2. LIGHT RAYS WEBGL BACKGROUND
═══════════════════════════════════════════════════════════ */
(function initLightRays() {
    function start() {
        const container = document.getElementById('prism-canvas-container');
        if (!container) return;

        const engine = window.ogl || (typeof ogl !== 'undefined' ? ogl : null);
        if (!engine) { setTimeout(start, 500); return; }

        const { Renderer, Program, Triangle, Mesh } = engine;

        // ── Config ────────────────────────────────────────────
        const cfg = {
            raysOrigin: 'top-center',
            raysColor: [1.0, 1.0, 1.0],   // white rays → GLSL tints them blue/purple
            raysSpeed: 0.8,
            lightSpread: 1.2,
            rayLength: 2.0,
            pulsating: true,
            fadeDistance: 1.0,
            saturation: 1.0,
            followMouse: true,
            mouseInfluence: 0.15,
            noiseAmount: 0.0,
            distortion: 0.0
        };

        // ── Helpers ───────────────────────────────────────────
        const getAnchorAndDir = (origin, w, h) => {
            const outside = 0.2;
            switch (origin) {
                case 'top-left': return { anchor: [0, -outside * h], dir: [0, 1] };
                case 'top-right': return { anchor: [w, -outside * h], dir: [0, 1] };
                case 'left': return { anchor: [-outside * w, 0.5 * h], dir: [1, 0] };
                case 'right': return { anchor: [(1 + outside) * w, 0.5 * h], dir: [-1, 0] };
                case 'bottom-left': return { anchor: [0, (1 + outside) * h], dir: [0, -1] };
                case 'bottom-center': return { anchor: [0.5 * w, (1 + outside) * h], dir: [0, -1] };
                case 'bottom-right': return { anchor: [w, (1 + outside) * h], dir: [0, -1] };
                default: return { anchor: [0.5 * w, -outside * h], dir: [0, 1] };
            }
        };

        // ── Renderer ──────────────────────────────────────────
        const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), alpha: true });
        const gl = renderer.gl;
        Object.assign(gl.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
        container.appendChild(gl.canvas);

        // ── Shaders ───────────────────────────────────────────
        const vert = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

        const frag = `
precision highp float;

uniform float iTime;
uniform vec2  iResolution;
uniform vec2  rayPos;
uniform vec2  rayDir;
uniform vec3  raysColor;
uniform float raysSpeed;
uniform float lightSpread;
uniform float rayLength;
uniform float pulsating;
uniform float fadeDistance;
uniform float saturation;
uniform vec2  mousePos;
uniform float mouseInfluence;
uniform float noiseAmount;
uniform float distortion;

varying vec2 vUv;

float noise(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float rayStrength(vec2 raySource, vec2 rayRefDirection, vec2 coord,
                  float seedA, float seedB, float speed) {
  vec2 sourceToCoord = coord - raySource;
  vec2 dirNorm = normalize(sourceToCoord);
  float cosAngle = dot(dirNorm, rayRefDirection);
  float distortedAngle = cosAngle + distortion * sin(iTime * 2.0 + length(sourceToCoord) * 0.01) * 0.2;
  float spreadFactor = pow(max(distortedAngle, 0.0), 1.0 / max(lightSpread, 0.001));
  float dist = length(sourceToCoord);
  float maxDist = iResolution.x * rayLength;
  float lengthFalloff = clamp((maxDist - dist) / maxDist, 0.0, 1.0);
  float fadeFalloff = clamp((iResolution.x * fadeDistance - dist) / (iResolution.x * fadeDistance), 0.5, 1.0);
  float pulse = pulsating > 0.5 ? (0.8 + 0.2 * sin(iTime * speed * 3.0)) : 1.0;
  float baseStrength = clamp(
    (0.45 + 0.15 * sin(distortedAngle * seedA + iTime * speed)) +
    (0.3  + 0.2  * cos(-distortedAngle * seedB + iTime * speed)),
    0.0, 1.0
  );
  return baseStrength * lengthFalloff * fadeFalloff * spreadFactor * pulse;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 coord = vec2(fragCoord.x, iResolution.y - fragCoord.y);
  vec2 finalRayDir = rayDir;
  if (mouseInfluence > 0.0) {
    vec2 mouseScreenPos = mousePos * iResolution.xy;
    vec2 mouseDirection = normalize(mouseScreenPos - rayPos);
    finalRayDir = normalize(mix(rayDir, mouseDirection, mouseInfluence));
  }
  vec4 rays1 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 36.2214, 21.11349, 1.5 * raysSpeed);
  vec4 rays2 = vec4(1.0) * rayStrength(rayPos, finalRayDir, coord, 22.3991, 18.0234,  1.1 * raysSpeed);
  fragColor = rays1 * 0.5 + rays2 * 0.4;
  if (noiseAmount > 0.0) {
    float n = noise(coord * 0.01 + iTime * 0.1);
    fragColor.rgb *= (1.0 - noiseAmount + noiseAmount * n);
  }
  float brightness = 1.0 - (coord.y / iResolution.y);
  fragColor.x *= 0.1 + brightness * 0.8;
  fragColor.y *= 0.3 + brightness * 0.6;
  fragColor.z *= 0.5 + brightness * 0.5;
  if (saturation != 1.0) {
    float gray = dot(fragColor.rgb, vec3(0.299, 0.587, 0.114));
    fragColor.rgb = mix(vec3(gray), fragColor.rgb, saturation);
  }
  fragColor.rgb *= raysColor;
}

void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  gl_FragColor = color;
}`;

        // ── Uniforms & Mesh ───────────────────────────────────
        const uniforms = {
            iTime: { value: 0 },
            iResolution: { value: [1, 1] },
            rayPos: { value: [0, 0] },
            rayDir: { value: [0, 1] },
            raysColor: { value: cfg.raysColor },
            raysSpeed: { value: cfg.raysSpeed },
            lightSpread: { value: cfg.lightSpread },
            rayLength: { value: cfg.rayLength },
            pulsating: { value: cfg.pulsating ? 1.0 : 0.0 },
            fadeDistance: { value: cfg.fadeDistance },
            saturation: { value: cfg.saturation },
            mousePos: { value: [0.5, 0.5] },
            mouseInfluence: { value: cfg.mouseInfluence },
            noiseAmount: { value: cfg.noiseAmount },
            distortion: { value: cfg.distortion }
        };

        const geometry = new Triangle(gl);
        const program = new Program(gl, { vertex: vert, fragment: frag, uniforms });
        const mesh = new Mesh(gl, { geometry, program });

        // ── Resize ────────────────────────────────────────────
        const updatePlacement = () => {
            const w = container.clientWidth || 1;
            const h = container.clientHeight || 1;
            renderer.setSize(w, h);
            const dpr = renderer.dpr;
            uniforms.iResolution.value = [w * dpr, h * dpr];
            const { anchor, dir } = getAnchorAndDir(cfg.raysOrigin, w * dpr, h * dpr);
            uniforms.rayPos.value = anchor;
            uniforms.rayDir.value = dir;
        };
        window.addEventListener('resize', updatePlacement);
        updatePlacement();

        // ── Mouse tracking ────────────────────────────────────
        let rawMouse = { x: 0.5, y: 0.5 };
        let smoothMouse = { x: 0.5, y: 0.5 };
        const onMouseMove = (e) => {
            const rect = container.getBoundingClientRect();
            rawMouse.x = (e.clientX - rect.left) / rect.width;
            rawMouse.y = (e.clientY - rect.top) / rect.height;
        };
        if (cfg.followMouse) window.addEventListener('mousemove', onMouseMove);

        // ── Render loop ───────────────────────────────────────
        let raf = 0;
        const loop = (t) => {
            uniforms.iTime.value = t * 0.001;
            if (cfg.followMouse) {
                const sm = 0.92;
                smoothMouse.x = smoothMouse.x * sm + rawMouse.x * (1 - sm);
                smoothMouse.y = smoothMouse.y * sm + rawMouse.y * (1 - sm);
                uniforms.mousePos.value = [smoothMouse.x, smoothMouse.y];
            }
            renderer.render({ scene: mesh });
            raf = requestAnimationFrame(loop);
        };

        // ── Intersection observer (suspend when off-screen) ───
        const io = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                if (!raf) raf = requestAnimationFrame(loop);
            } else {
                if (raf) { cancelAnimationFrame(raf); raf = 0; }
            }
        }, { threshold: 0.1 });
        io.observe(container);
    }

    start();
})();



/* ═══════════════════════════════════════════════════════════
   2.3. GLOWING EFFECT SKILLS CARDS
══════════════════════════════════════════════════════════ */
(function initGlowingEffect() {
    // Config — mirrors props from the demo
    const SPREAD = 40;    // arc half-width in degrees (spread={40})
    const PROXIMITY = 64;    // px outside card that still activates (proximity={64})
    const INACTIVE_ZONE = 0.01;  // fraction of shorter axis that stays off (inactiveZone={0.01})
    const LERP_SPEED = 0.09;  // angle lerp factor per frame (~movementDuration: 2s)
    const BORDER_WIDTH = 3;     // px (borderWidth={3})

    const items = Array.from(document.querySelectorAll('.ge-item'));
    if (!items.length) return;

    // Set CSS border-width var on all outer wrappers
    document.querySelectorAll('.ge-card-outer').forEach(el => {
        el.style.setProperty('--ge-border-width', BORDER_WIDTH + 'px');
        el.style.setProperty('--spread', SPREAD);
    });

    items.forEach(li => {
        const outer = li.querySelector('.ge-card-outer');
        const inner = li.querySelector('.ge-card-inner');
        if (!outer) return;

        let curAngle = 0;
        let tgtAngle = 0;
        let rafId = null;
        let lastX = 0;
        let lastY = 0;

        // Smooth angle animation (replaces motion/react animate with ease [0.16,1,0.3,1])
        const animateAngle = () => {
            // Shortest angular path — handles 359°→1° correctly
            let diff = ((tgtAngle - curAngle + 180) % 360) - 180;
            if (diff < -180) diff += 360;
            curAngle += diff * LERP_SPEED;
            outer.style.setProperty('--start', curAngle.toFixed(2));

            if (Math.abs(diff) > 0.15) {
                rafId = requestAnimationFrame(animateAngle);
            } else {
                outer.style.setProperty('--start', tgtAngle.toFixed(2));
                curAngle = tgtAngle;
                rafId = null;
            }
        };

        // Core logic — mirrors GlowingEffect.handleMove
        const handleMove = (e) => {
            if (e) { lastX = e.x ?? e.clientX; lastY = e.y ?? e.clientY; }

            const rect = outer.getBoundingClientRect();
            const centerX = rect.left + rect.width * 0.5;
            const centerY = rect.top + rect.height * 0.5;

            // Inactive zone: dead ring around center
            const inactiveR = 0.5 * Math.min(rect.width, rect.height) * INACTIVE_ZONE;
            if (Math.hypot(lastX - centerX, lastY - centerY) < inactiveR) {
                outer.style.setProperty('--active', '0');
                return;
            }

            // Proximity check
            const isActive =
                lastX > rect.left - PROXIMITY &&
                lastX < rect.right + PROXIMITY &&
                lastY > rect.top - PROXIMITY &&
                lastY < rect.bottom + PROXIMITY;

            outer.style.setProperty('--active', isActive ? '1' : '0');
            if (!isActive) return;

            // Angle: 0° at top, clockwise (matches atan2 + 90° offset in source)
            tgtAngle = (180 * Math.atan2(lastY - centerY, lastX - centerX)) / Math.PI + 90;
            if (!rafId) rafId = requestAnimationFrame(animateAngle);
        };

        window.addEventListener('pointermove', handleMove, { passive: true });
        window.addEventListener('scroll', () => handleMove(null), { passive: true });

        // SpotlightCard: inner radial glow follows mouse inside the card
        // Mirrors React handleMouseMove: x = clientX - rect.left, y = clientY - rect.top
        if (inner) {
            inner.addEventListener('pointermove', (e) => {
                const r = inner.getBoundingClientRect();
                inner.style.setProperty('--mouse-x', (e.clientX - r.left) + 'px');
                inner.style.setProperty('--mouse-y', (e.clientY - r.top) + 'px');
            }, { passive: true });
        }
    });
})();


/* ═══════════════════════════════════════════════════════════
   3. ANIME NAVBAR INTERACTIVITY
═══════════════════════════════════════════════════════════ */
(function initAnimeNav() {
    const nav = document.getElementById('anime-nav');
    if (!nav) return;

    const navLinks = nav.querySelectorAll('.anime-nav__link');
    const pill = document.getElementById('anime-nav-pill');
    const mascot = document.getElementById('anime-mascot');
    const sections = document.querySelectorAll('section[id], footer[id]');

    let currentLeft = 0;
    let targetLeft = 0;
    let currentWidth = 0;
    let targetWidth = 0;

    let currentHeight = 0;
    let targetHeight = 0;
    let currentTop = 0;
    let targetTop = 0;

    function updateNavMetrics() {
        const activeLink = nav.querySelector('.anime-nav__link.is-active');
        if (activeLink) {
            const li = activeLink.closest('.anime-nav__item');
            if (li) {
                targetWidth = activeLink.offsetWidth;
                targetHeight = activeLink.offsetHeight;
                targetLeft = li.offsetLeft + activeLink.offsetLeft;
                targetTop = li.offsetTop + activeLink.offsetTop;
            }
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('mouseenter', () => mascot && mascot.classList.add('wink'));
        link.addEventListener('mouseleave', () => mascot && mascot.classList.remove('wink'));

        link.addEventListener('click', () => {
            navLinks.forEach(l => l.classList.remove('is-active'));
            link.classList.add('is-active');
            updateNavMetrics();
        });
    });

    function highlightActiveLink() {
        const header = document.getElementById('header');
        if (header) {
            if (window.scrollY > 40) {
                header.classList.add('is-scrolled');
            } else {
                header.classList.remove('is-scrolled');
            }
        }

        let current = 'hero';
        sections.forEach(sec => {
            const offset = sec.offsetTop - 250;
            if (window.scrollY >= offset) current = sec.id;
        });

        navLinks.forEach((link) => {
            const href = link.getAttribute('href');
            const targetHash = href.split('#')[1] || '';
            const isHomePage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '';

            let isActive = false;

            if (isHomePage) {
                isActive = targetHash === current;
            } else {
                // On sub-pages (design, dev, etc.), highlight 'Work' as default
                isActive = (targetHash === 'work');
            }

            link.classList.toggle('is-active', isActive);
        });

        updateNavMetrics();
    }

    function animate() {
        // Spring-like interpolation
        currentLeft += (targetLeft - currentLeft) * 0.12;
        currentWidth += (targetWidth - currentWidth) * 0.12;
        currentHeight += (targetHeight - currentHeight) * 0.12;
        currentTop += (targetTop - currentTop) * 0.12;

        if (pill) {
            pill.style.width = `${currentWidth}px`;
            pill.style.height = `${currentHeight}px`;
            pill.style.transform = `translate(${currentLeft}px, ${currentTop}px)`;
            pill.style.opacity = '1';
        }

        if (mascot) {
            const mascotCenterOffset = (currentWidth / 2) - 22;
            mascot.style.left = `${currentLeft + mascotCenterOffset}px`;

            // Handle scale and vertical offset in JS to avoid CSS transform conflicts
            const isScrolled = document.getElementById('header').classList.contains('is-scrolled');
            const scale = isScrolled ? 0.75 : 1;
            mascot.style.transform = `translateY(${currentTop * 0.5}px) scale(${scale})`;
        }

        requestAnimationFrame(animate);
    }

    window.addEventListener('scroll', highlightActiveLink, { passive: true });
    window.addEventListener('resize', () => {
        updateNavMetrics();
        currentLeft = targetLeft;
        currentWidth = targetWidth;
    });

    // Initial sync
    function init() {
        highlightActiveLink();
        updateNavMetrics();
        currentLeft = targetLeft;
        currentWidth = targetWidth;
        animate();
    }

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

    // Fallback for dynamic content/fonts
    setTimeout(init, 500);
})();

/* ═══════════════════════════════════════════════════════════
   4. HAMBURGER MENU (Legacy Support)
═══════════════════════════════════════════════════════════ */
const mobileMenu = document.getElementById('mobile-menu');
const hamburger = document.getElementById('hamburger');

function toggleMenu() {
    if (!mobileMenu || !hamburger) return;
    const isOpen = mobileMenu.classList.contains('open');
    if (isOpen) {
        closeMenu();
    } else {
        mobileMenu.classList.add('open');
        mobileMenu.setAttribute('aria-hidden', 'false');
        hamburger.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    }
}

function closeMenu() {
    if (!mobileMenu || !hamburger) return;
    mobileMenu.classList.remove('open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
}

if (hamburger) hamburger.addEventListener('click', toggleMenu);
document.querySelectorAll('.mobile-menu__link').forEach(l => l.addEventListener('click', closeMenu));
window.addEventListener('resize', () => window.innerWidth > 840 && closeMenu());

/* ═══════════════════════════════════════════════════════════
   6. SMOOTH SCROLL
═══════════════════════════════════════════════════════════ */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const id = this.getAttribute('href');
        if (id === '#') return;
        const el = document.querySelector(id);
        if (!el) return;
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

/* ═══════════════════════════════════════════════════════════
   7. SCROLL-TRIGGERED FADE + SLIDE ANIMATIONS
═══════════════════════════════════════════════════════════ */
const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const delay = parseInt(el.dataset.delay || '0', 10);
        setTimeout(() => el.classList.add('visible'), delay);
        revealObserver.unobserve(el);
    });
}, {
    threshold: 0.01, // Lower threshold to trigger earlier
    rootMargin: '0px 0px 50px 0px' // Positive margin to trigger BEFORE it hits the viewport
});

document.querySelectorAll('[data-animate]').forEach(el => revealObserver.observe(el));

// Immediate check for elements in view on load
window.addEventListener('load', () => {
    document.querySelectorAll('[data-animate]').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
            el.classList.add('visible');
            revealObserver.unobserve(el);
        }
    });
});

/* ═══════════════════════════════════════════════════════════
   8. TYPEWRITER EFFECT
═══════════════════════════════════════════════════════════ */
(function initTypewriter() {
    const el = document.getElementById('typewriter-target');
    if (!el) return;

    const words = ['Designer', 'Developer', 'Ai Architect'];
    let wordIndex = 0, charIndex = 0, deleting = false;

    function type() {
        const current = words[wordIndex];
        if (deleting) {
            charIndex--;
            el.textContent = current.slice(0, charIndex);
            if (charIndex === 0) {
                deleting = false;
                wordIndex = (wordIndex + 1) % words.length;
                setTimeout(type, 500);
                return;
            }
            setTimeout(type, 45);
        } else {
            charIndex++;
            el.textContent = current.slice(0, charIndex);
            if (charIndex === current.length) {
                deleting = true;
                setTimeout(type, 2200);
                return;
            }
            setTimeout(type, 90);
        }
    }

    // Start after hero animates in
    setTimeout(type, 1000);
})();

/* ═══════════════════════════════════════════════════════════
   9. ANIMATED COUNTER (stats)
═══════════════════════════════════════════════════════════ */
(function initCounters() {
    const counters = document.querySelectorAll('[data-count]');
    if (!counters.length) return;

    const counterObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            const target = parseInt(el.dataset.count, 10);
            const suffix = el.dataset.suffix || '+';
            const dur = 1800; // ms
            const steps = 50;
            const step = dur / steps;
            let current = 0;

            const timer = setInterval(() => {
                current++;
                const val = Math.round(easeOut(current, 0, target, steps));
                el.textContent = val + suffix;
                if (current >= steps) {
                    clearInterval(timer);
                    el.textContent = target + suffix;
                }
            }, step);

            counterObserver.unobserve(el);
        });
    }, { threshold: 0.5 });

    counters.forEach(c => counterObserver.observe(c));

    function easeOut(t, b, c, d) {
        t /= d;
        return -c * t * (t - 2) + b;
    }
})();

/* ═══════════════════════════════════════════════════════════
   10. STAGGERED SKILL TAGS ENTRANCE
═══════════════════════════════════════════════════════════ */
(function initSkillTags() {
    const grid = document.querySelector('.ge-grid');
    if (!grid) return;

    // Pre-hide tags
    const tags = grid.querySelectorAll('.skill-tag');
    tags.forEach(tag => {
        tag.style.opacity = '0';
        tag.style.transform = 'translateY(16px) scale(0.92)';
        tag.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    });

    const skillsObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            tags.forEach((tag, i) => {
                setTimeout(() => {
                    tag.style.opacity = '1';
                    tag.style.transform = 'translateY(0) scale(1)';
                }, i * 55);
            });
            skillsObserver.unobserve(entry.target);
        });
    }, { threshold: 0.2 });

    skillsObserver.observe(grid);
})();

/* ═══════════════════════════════════════════════════════════
   11. 3D CARD TILT + GLARE + CERT SPOTLIGHT
═══════════════════════════════════════════════════════════ */
(function initCardTilt() {
    const cards = document.querySelectorAll('.project-card');
    const certCards = document.querySelectorAll('.cert-card');

    const handleTilt = (card, e, isCert = false) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        requestAnimationFrame(() => {
            if (isCert) {
                card.style.setProperty('--h-x', (x / rect.width) * 100 + '%');
                card.style.setProperty('--h-y', (y / rect.height) * 100 + '%');
            } else {
                const dx = (x / rect.width) * 2 - 1;
                const dy = (y / rect.height) * 2 - 1;
                card.style.transform = `perspective(1000px) rotateX(${-dy * 5}deg) rotateY(${dx * 5}deg) scale3d(1.02, 1.02, 1.02)`;

                const glare = card.querySelector('.project-card__glare');
                if (glare) {
                    glare.style.setProperty('--mx', (x / rect.width) * 100 + '%');
                    glare.style.setProperty('--my', (y / rect.height) * 100 + '%');
                }
            }
        });
    };

    cards.forEach(card => {
        card.addEventListener('mousemove', e => handleTilt(card, e), { passive: true });
        card.addEventListener('mouseleave', () => {
            requestAnimationFrame(() => {
                card.style.transform = '';
                card.style.transition = 'transform 0.6s var(--ease)';
                setTimeout(() => { card.style.transition = ''; }, 600);
            });
        });
    });

    certCards.forEach(card => {
        card.addEventListener('mousemove', e => handleTilt(card, e, true), { passive: true });
    });
})();

/* ═══════════════════════════════════════════════════════════
   12. HERO IMAGE WRAP — SUBTLE MOUSE PARALLAX
═══════════════════════════════════════════════════════════ */
(function initParallax() {
    const wrap = document.querySelector('.hero__image-wrap');
    if (!wrap) return;

    window.addEventListener('mousemove', e => {
        if (window.scrollY > 0 && Math.abs(window.scrollY - lastScrollY) > 5) return; // Skip if scrolling
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const dx = (e.clientX - cx) / cx;
        const dy = (e.clientY - cy) / cy;
        wrap.style.transform = `translate(${dx * 8}px, ${dy * 6}px)`;
    }, { passive: true });

    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => { lastScrollY = window.scrollY; }, { passive: true });
})();

/* ═══════════════════════════════════════════════════════════
   13. PAGE ENTER ANIMATION
═══════════════════════════════════════════════════════════ */
// (Removed body opacity logic to prevent load-time invisibility)

/* ═══════════════════════════════════════════════════════════
   14. ETHEREAL SHADOW — HUE ROTATION ANIMATION
═══════════════════════════════════════════════════════════ */
(function initEtherealShadow() {
    const heroEl = document.getElementById('eth-rotate-hero');
    const contactEl = document.getElementById('eth-rotate-contact');
    if (!heroEl && !contactEl) return;

    const SPEED_HERO = 0.36;
    const SPEED_CONTACT = 0.22;

    let hueHero = 180;
    let hueContact = 0;

    function animateEthereal() {
        hueHero = (hueHero + SPEED_HERO) % 360;
        hueContact = (hueContact + SPEED_CONTACT) % 360;

        if (heroEl) heroEl.setAttribute('values', String(hueHero.toFixed(2)));
        if (contactEl) contactEl.setAttribute('values', String(hueContact.toFixed(2)));

        requestAnimationFrame(animateEthereal);
    }

    animateEthereal();

    window.addEventListener('mousemove', e => {
        const xPct = (e.clientX / window.innerWidth - 0.5) * 12;
        const yPct = (e.clientY / window.innerHeight - 0.5) * 8;
        const inner = document.getElementById('ethereal-inner-hero');
        if (inner) {
            inner.style.transform = `translate(${xPct}px, ${yPct}px)`;
        }
    });
})();


/* ═══════════════════════════════════════════════════════════
   15. LASER FLOW — Three.js Implementation
   Beams flow TOP→DOWN and branch around the central photo.
═══════════════════════════════════════════════════════════ */
(function initLaserFlow() {
    'use strict';

    if (typeof THREE === 'undefined') {
        console.warn('[LaserFlow] THREE.js not found');
        return;
    }

    const mount = document.getElementById('laser-flow-mount');
    if (!mount) {
        // Not on the homepage, skip laser flow entirely
        return;
    }

    const CFG = {
        wispDensity: 1.0,
        mouseTiltStrength: 0.01,
        horizontalBeamOffset: 0.1,
        verticalBeamOffset: 0.0,
        flowSpeed: 0.35,
        verticalSizing: 2.0,
        horizontalSizing: 0.5,
        fogIntensity: 0.45,
        fogScale: 0.3,
        wispSpeed: 15.0,
        wispIntensity: 5.0,
        flowStrength: 0.25,
        decay: 1.1,
        falloffStart: 1.2,
        fogFallSpeed: 0.6,
        color: '#CF9EFF' // Refined Pinkish Purple
    };

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // KEEP TRANSPARENT

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    mount.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));

    const VERT = `
precision highp float;
attribute vec3 position;
void main(){
  gl_Position = vec4(position, 1.0);
}
`;

    const FRAG = `
#ifdef GL_ES
#extension GL_OES_standard_derivatives : enable
#endif
precision highp float;
precision mediump int;

uniform float iTime;
uniform vec3 iResolution;
uniform vec4 iMouse;
uniform float uWispDensity;
uniform float uTiltScale;
uniform float uFlowTime;
uniform float uFogTime;
uniform float uBeamXFrac;
uniform float uBeamYFrac;
uniform float uFlowSpeed;
uniform float uVLenFactor;
uniform float uHLenFactor;
uniform float uFogIntensity;
uniform float uFogScale;
uniform float uWSpeed;
uniform float uWIntensity;
uniform float uFlowStrength;
uniform float uDecay;
uniform float uFalloffStart;
uniform float uFogFallSpeed;
uniform vec3 uColor;
uniform float uFade;

#define PI 3.14159265359
#define TWO_PI 6.28318530718
#define EPS 1e-6
#define EDGE_SOFT (DT_LOCAL*4.0)
#define DT_LOCAL 0.0038
#define TAP_RADIUS 6
#define R_H 150.0
#define R_V 150.0
#define FLARE_HEIGHT 16.0
#define FLARE_AMOUNT 8.0
#define FLARE_EXP 2.0
#define TOP_FADE_START 0.1
#define TOP_FADE_EXP 1.0
#define FLOW_PERIOD 0.5
#define FLOW_SHARPNESS 1.5

#define W_BASE_X 1.5
#define W_LAYER_GAP 0.25
#define W_LANES 10
#define W_SIDE_DECAY 0.5
#define W_HALF 0.01
#define W_AA 0.15
#define W_CELL 20.0
#define W_SEG_MIN 0.01
#define W_SEG_MAX 0.55
#define W_CURVE_AMOUNT 15.0
#define W_CURVE_RANGE (FLARE_HEIGHT - 3.0)
#define W_BOTTOM_EXP 10.0

#define FOG_ON 1
#define FOG_CONTRAST 1.2
#define FOG_OCTAVES 5
#define FOG_BOTTOM_BIAS 0.8
#define FOG_TILT_MAX_X 0.35
#define FOG_TILT_SHAPE 1.5
#define FOG_BEAM_MIN 0.0
#define FOG_BEAM_MAX 0.75
#define FOG_MASK_GAMMA 0.5
#define FOG_EXPAND_SHAPE 12.2
#define FOG_EDGE_MIX 0.5

#define HFOG_EDGE_START 0.20
#define HFOG_EDGE_END 0.98
#define HFOG_EDGE_GAMMA 1.4
#define HFOG_Y_RADIUS 25.0
#define HFOG_Y_SOFT 60.0

#define EDGE_X0 0.22
#define EDGE_X1 0.995
#define EDGE_X_GAMMA 1.25
#define EDGE_LUMA_T0 0.0
#define EDGE_LUMA_T1 2.0
#define DITHER_STRENGTH 1.0

    float g(float x){return x<=0.00031308?12.92*x:1.055*pow(x,1.0/2.4)-0.055;}
    float bs(vec2 p,vec2 q,float powr){
        float d=distance(p,q),f=powr*uFalloffStart,r=(f*f)/(d*d+EPS);
        return powr*min(1.0,r);
    }
    float bsa(vec2 p,vec2 q,float powr,vec2 s){
        vec2 d=p-q; float dd=(d.x*d.x)/(s.x*s.x)+(d.y*d.y)/(s.y*s.y),f=powr*uFalloffStart,r=(f*f)/(dd+EPS);
        return powr*min(1.0,r);
    }
    float tri01(float x){float f=fract(x);return 1.0-abs(f*2.0-1.0);}
    float tauWf(float t,float tmin,float tmax){float a=smoothstep(tmin,tmin+EDGE_SOFT,t),b=1.0-smoothstep(tmax-EDGE_SOFT,tmax,t);return max(0.0,a*b);} 
    float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+34.123);return fract(p.x*p.y);}
    float vnoise(vec2 p){
        vec2 i=floor(p),f=fract(p);
        float a=h21(i),b=h21(i+vec2(1,0)),c=h21(i+vec2(0,1)),d=h21(i+vec2(1,1));
        vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
    }
    float fbm2(vec2 p){
        float v=0.0,amp=0.6; mat2 m=mat2(0.86,0.5,-0.5,0.86);
        for(int i=0;i<FOG_OCTAVES;++i){v+=amp*vnoise(p); p=m*p*2.03+17.1; amp*=0.52;}
        return v;
    }
    float rGate(float x,float l){float a=smoothstep(0.0,W_AA,x),b=1.0-smoothstep(l,l+W_AA,x);return max(0.0,a*b);}
    float flareY(float y){float t=clamp(1.0-(clamp(y,0.0,FLARE_HEIGHT)/max(FLARE_HEIGHT,EPS)),0.0,1.0);return pow(t,FLARE_EXP);}

    float sdPill(vec2 p, float r, float h) {
        p.y -= clamp(p.y, -h, h);
        return length(p) - r;
    }

    float vWisps(vec2 uv,float topF){
    float y=uv.y,yf=(y+uFlowTime*uWSpeed)/W_CELL;
    float dRaw=clamp(uWispDensity,0.0,2.0),d=dRaw<=0.0?1.0:dRaw;
    float lanesF=floor(float(W_LANES)*min(d,1.0)+0.5);
    int lanes=int(max(1.0,lanesF));
    float sp=min(d,1.0),ep=max(d-1.0,0.0);
    float fm=flareY(max(y,0.0)),rm=clamp(1.0-(y/max(W_CURVE_RANGE,EPS)),0.0,1.0),cm=fm*rm;
    const float G=0.05; float xS=1.0+(FLARE_AMOUNT*W_CURVE_AMOUNT*G)*cm;
    float sPix=clamp(y/R_V,0.0,1.0),bGain=pow(1.0-sPix,W_BOTTOM_EXP),sum=0.0;
    for(int s=0;s<2;++s){
        float sgn=s==0?-1.0:1.0;
        for(int i=0;i<W_LANES;++i){
            if(i>=lanes) break;
            float off=W_BASE_X+float(i)*W_LAYER_GAP,xc=sgn*(off*xS);
            float dx=abs(uv.x-xc),lat=1.0-smoothstep(W_HALF,W_HALF+W_AA,dx),amp=exp(-off*W_SIDE_DECAY);
            float seed=h21(vec2(off,sgn*17.0)),yf2=yf+seed*7.0,ci=floor(yf2),fy=fract(yf2);
            float seg=mix(W_SEG_MIN,W_SEG_MAX,h21(vec2(ci,off*2.3)));
            float spR=h21(vec2(ci,off+sgn*31.0)),seg1=rGate(fy,seg)*step(spR,sp);
            if(ep>0.0){float spR2=h21(vec2(ci*3.1+7.0,off*5.3+sgn*13.0)); float f2=fract(fy+0.5); seg1+=rGate(f2,seg*0.9)*step(spR2,ep);}
            sum+=amp*lat*seg1;
        }
    }
    float span=smoothstep(-3.0,0.0,y)*(1.0-smoothstep(R_V-6.0,R_V,y));
    return uWIntensity*sum*topF*bGain*span;
}

void mainImage(out vec4 fc,in vec2 frag){
    vec2 C=iResolution.xy*.5; float invW=1.0/max(C.x,1.0);
    float sc=512.0/iResolution.x*.4;
    
    // Coords from TOP TO BOTTOM
    vec2 flippedFrag = vec2(frag.x, iResolution.y - frag.y);
    vec2 uv=(flippedFrag-C)*sc;
    
    // ── SPLITTING DISPLACEMENT ──
    // Refined to wrap tightly around the portrait
    float dP = sdPill(uv, 35.0, 48.0);
    if(dP < 25.0) {
        float warp = smoothstep(25.0, -5.0, dP);
        uv.x += warp * 55.0 * sign(uv.x);
    }
    
    vec2 off=vec2(uBeamXFrac*iResolution.x*sc,uBeamYFrac*iResolution.y*sc);
    vec2 uvc = uv - off;
    float a=0.0,b=0.0;
    float basePhase=1.5*PI+uDecay*.5; float tauMin=basePhase-uDecay; float tauMax=basePhase;
    float cx=clamp(uvc.x/(R_H*uHLenFactor),-1.0,1.0),tH=clamp(TWO_PI-acos(cx),tauMin,tauMax);
    for(int k=-TAP_RADIUS;k<=TAP_RADIUS;++k){
        float tu=tH+float(k)*DT_LOCAL,wt=tauWf(tu,tauMin,tauMax); if(wt<=0.0) continue;
        float spd=max(abs(sin(tu)),0.02),u=clamp((basePhase-tu)/max(uDecay,EPS),0.0,1.0),env=pow(1.0-abs(u*2.0-1.0),0.8);
        vec2 p=vec2((R_H*uHLenFactor)*cos(tu),0.0);
        a+=wt*bs(uvc,p,env*spd);
    }
    float yPix=uvc.y,cy=clamp(-yPix/(R_V*uVLenFactor),-1.0,1.0),tV=clamp(TWO_PI-acos(cy),tauMin,tauMax);
    for(int k=-TAP_RADIUS;k<=TAP_RADIUS;++k){
        float tu=tV+float(k)*DT_LOCAL,wt=tauWf(tu,tauMin,tauMax); if(wt<=0.0) continue;
        float yb=(-R_V)*cos(tu),s=clamp(yb/R_V,0.0,1.0),spd=max(abs(sin(tu)),0.02);
        float env=pow(1.0-s,0.6)*spd;
        float cap=1.0-smoothstep(TOP_FADE_START,1.0,s); cap=pow(cap,TOP_FADE_EXP); env*=cap;
        float ph=s/max(FLOW_PERIOD,EPS)+uFlowTime*uFlowSpeed;
        float fl=pow(tri01(ph),FLOW_SHARPNESS);
        env*=mix(1.0-uFlowStrength,1.0,fl);
        float yp=(-R_V*uVLenFactor)*cos(tu),m=pow(smoothstep(FLARE_HEIGHT,0.0,yp),FLARE_EXP),wx=1.0+FLARE_AMOUNT*m;
        vec2 sig=vec2(wx,1.0),p=vec2(0.0,yp);
        float mask=step(0.0,yp);
        b+=wt*bsa(uvc,p,mask*env,sig);
    }
    float sPix=clamp(yPix/R_V,0.0,1.0),topA=pow(1.0-smoothstep(TOP_FADE_START,1.0,sPix),TOP_FADE_EXP);
    float L=a+b*topA;
    float w=vWisps(vec2(uvc.x,yPix),topA);
    float fog=0.0;
#if FOG_ON
    vec2 fuv=uvc*uFogScale;
    float mAct=step(1.0,length(iMouse.xy)),nx=((iMouse.x-C.x)*invW)*mAct;
    float ax = abs(nx);
    float stMag = mix(ax, pow(ax, FOG_TILT_SHAPE), 0.35);
    float st = sign(nx) * stMag * uTiltScale;
    st = clamp(st, -FOG_TILT_MAX_X, FOG_TILT_MAX_X);
    vec2 dir=normalize(vec2(st,1.0));
    fuv+=uFogTime*uFogFallSpeed*dir;
    vec2 prp=vec2(-dir.y,dir.x);
    fuv+=prp*(0.08*sin(dot(uvc,prp)*0.08+uFogTime*0.9));
    float n=fbm2(fuv+vec2(fbm2(fuv+vec2(7.3,2.1)),fbm2(fuv+vec2(-3.7,5.9)))*0.6);
    n=pow(clamp(n,0.0,1.0),FOG_CONTRAST);
    float pixW = 1.0 / max(iResolution.y, 1.0);
    float wL = pixW;
    float m0=pow(smoothstep(FOG_BEAM_MIN - wL, FOG_BEAM_MAX + wL, L),FOG_MASK_GAMMA);
    float bm=1.0-pow(1.0-m0,FOG_EXPAND_SHAPE); bm=mix(bm*m0,bm,FOG_EDGE_MIX);
    float yP=1.0-smoothstep(HFOG_Y_RADIUS,HFOG_Y_RADIUS+HFOG_Y_SOFT,abs(yPix));
    float nxF=abs((flippedFrag.x-C.x)*invW),hE=1.0-smoothstep(HFOG_EDGE_START,HFOG_EDGE_END,nxF); hE=pow(clamp(hE,0.0,1.0),HFOG_EDGE_GAMMA);
    float hW=mix(1.0,hE,clamp(yP,0.0,1.0));
    float bBias=mix(1.0,1.0-sPix,FOG_BOTTOM_BIAS);
    float browserFogIntensity = uFogIntensity * 1.8;
    float radialFade = 1.0 - smoothstep(0.0, 0.7, length(uvc) / 120.0);
    fog = n * browserFogIntensity * bBias * bm * hW * radialFade;
#endif
    float LF=L+fog;
    float dith=(h21(flippedFrag)-0.5)*(DITHER_STRENGTH/255.0);
    float tone=g(LF+w);
    vec3 col=tone*uColor+dith;
    float alpha=clamp(g(L+w*0.6)+dith*0.6,0.0,1.0);
    float nxE=abs((flippedFrag.x-C.x)*invW),xF=pow(clamp(1.0-smoothstep(EDGE_X0,EDGE_X1,nxE),0.0,1.0),EDGE_X_GAMMA);
    float scene=LF+max(0.0,w)*0.5,hi=smoothstep(EDGE_LUMA_T0,EDGE_LUMA_T1,scene);
    float eM=mix(xF,1.0,hi);
    col*=eM; alpha*=eM;
    col*=uFade; alpha*=uFade;
    fc=vec4(col,alpha);
}

void main(){
  vec4 fc;
  mainImage(fc, gl_FragCoord.xy);
  gl_FragColor = fc;
}
`;

    const hexToRGB = hex => {
        let c = hex.trim();
        if (c[0] === '#') c = c.slice(1);
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const n = parseInt(c, 16) || 0xffffff;
        return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
    };

    const uniforms = {
        iTime: { value: 0 },
        iResolution: { value: new THREE.Vector3(1, 1, 1) },
        iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
        uWispDensity: { value: CFG.wispDensity },
        uTiltScale: { value: CFG.mouseTiltStrength },
        uFlowTime: { value: 0 },
        uFogTime: { value: 0 },
        uBeamXFrac: { value: CFG.horizontalBeamOffset },
        uBeamYFrac: { value: CFG.verticalBeamOffset },
        uFlowSpeed: { value: CFG.flowSpeed },
        uVLenFactor: { value: CFG.verticalSizing },
        uHLenFactor: { value: CFG.horizontalSizing },
        uFogIntensity: { value: CFG.fogIntensity },
        uFogScale: { value: CFG.fogScale },
        uWSpeed: { value: CFG.wispSpeed },
        uWIntensity: { value: CFG.wispIntensity },
        uFlowStrength: { value: CFG.flowStrength },
        uDecay: { value: CFG.decay },
        uFalloffStart: { value: CFG.falloffStart },
        uFogFallSpeed: { value: CFG.fogFallSpeed },
        uColor: { value: hexToRGB(CFG.color) },
        uFade: { value: 0 }
    };

    const material = new THREE.RawShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending
    });

    console.log('[LaserFlow] Material and scene ready');

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    let fade = 0;
    function resize() {
        const w = mount.offsetWidth || 400;
        const h = mount.offsetHeight || 600;
        const pr = Math.min(window.devicePixelRatio, 2);
        renderer.setPixelRatio(pr);
        renderer.setSize(w, h, false);
        uniforms.iResolution.value.set(w * pr, h * pr, pr);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let prev = performance.now();
    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const dt = Math.min(0.05, (now - prev) / 1000);
        prev = now;

        uniforms.iTime.value += dt;
        uniforms.uFlowTime.value += dt;
        uniforms.uFogTime.value += dt;

        if (fade < 1) {
            fade = Math.min(1, fade + dt / 1.5);
            uniforms.uFade.value = fade;
        }

        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('beforeunload', () => {
        ro.disconnect();
        geometry.dispose();
        material.dispose();
        renderer.dispose();
    });
})();

/* ═══════════════════════════════════════════════════════════
   16. PROFILE CARD INTERACTIVITY (Tilt + Shine)
═══════════════════════════════════════════════════════════ */
(function initProfileCard() {
    const wrap = document.getElementById('hero-profile-card');
    const shell = document.getElementById('hero-card-shell');
    if (!wrap || !shell) return;

    let running = false;
    let currentX = 0, currentY = 0;
    let targetX = 0, targetY = 0;
    let lastTs = 0;

    const DEFAULT_TAU = 0.14;
    const INITIAL_TAU = 0.6;
    let initialUntil = 0;

    function clamp(v, min = 0, max = 100) { return Math.min(Math.max(v, min), max); }
    function round(v) { return parseFloat(v.toFixed(3)); }
    function adjust(v, fMin, fMax, tMin, tMax) { return round(tMin + ((tMax - tMin) * (v - fMin)) / (fMax - fMin)); }

    function setVars(x, y) {
        const width = shell.clientWidth || 1;
        const height = shell.clientHeight || 1;

        const pX = clamp((100 / width) * x);
        const pY = clamp((100 / height) * y);
        const cX = pX - 50;
        const cY = pY - 50;

        wrap.style.setProperty('--pointer-x', `${pX}%`);
        wrap.style.setProperty('--pointer-y', `${pY}%`);
        wrap.style.setProperty('--background-x', `${adjust(pX, 0, 100, 35, 65)}%`);
        wrap.style.setProperty('--background-y', `${adjust(pY, 0, 100, 35, 65)}%`);
        wrap.style.setProperty('--pointer-from-center', `${clamp(Math.hypot(pY - 50, pX - 50) / 50, 0, 1)}`);
        wrap.style.setProperty('--pointer-from-top', `${pY / 100}`);
        wrap.style.setProperty('--pointer-from-left', `${pX / 100}`);
        wrap.style.setProperty('--rotate-x', `${round(-(cX / 5))}deg`);
        wrap.style.setProperty('--rotate-y', `${round(cY / 4)}deg`);
    }

    function step(ts) {
        if (!running) return;
        if (lastTs === 0) lastTs = ts;
        const dt = (ts - lastTs) / 1000;
        lastTs = ts;

        const tau = ts < initialUntil ? INITIAL_TAU : DEFAULT_TAU;
        const k = 1 - Math.exp(-dt / tau);

        currentX += (targetX - currentX) * k;
        currentY += (targetY - currentY) * k;

        setVars(currentX, currentY);

        if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
            requestAnimationFrame(step);
        } else {
            running = false;
        }
    }

    function start() {
        if (running) return;
        running = true;
        lastTs = 0;
        requestAnimationFrame(step);
    }

    function moveTarget(x, y) {
        targetX = x; targetY = y;
        start();
    }

    shell.addEventListener('pointermove', (e) => {
        const rect = shell.getBoundingClientRect();
        moveTarget(e.clientX - rect.left, e.clientY - rect.top);
    });

    shell.addEventListener('pointerenter', () => {
        shell.classList.add('is-active', 'entering');
        setTimeout(() => shell.classList.remove('entering'), 200);
    });

    shell.addEventListener('pointerleave', () => {
        shell.classList.remove('is-active');
        moveTarget(shell.clientWidth / 2, shell.clientHeight / 2);
    });

    // Initial Intro Animation
    setTimeout(() => {
        const w = shell.clientWidth || 300;
        const h = shell.clientHeight || 450;
        currentX = w - 50; currentY = 50;
        targetX = w / 2; targetY = h / 2;
        initialUntil = performance.now() + 1200;
        start();
    }, 500);
})();


/* ═══════════════════════════════════════════════════════════
   4. WORK GALLERIES SWITCHER
══════════════════════════════════════════════════════════ */
(function initWorkGalleries() {
    const tabs = document.querySelectorAll('.work__tab');
    const galleries = document.querySelectorAll('.work__gallery');

    if (!tabs.length) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-target');

            // Update tabs
            tabs.forEach(t => t.classList.remove('is-active'));
            tab.classList.add('is-active');

            // Update galleries
            galleries.forEach(g => {
                g.classList.remove('is-active');
                if (g.id === `gallery-${target}`) {
                    g.classList.add('is-active');
                }
            });

            // Trigger re-animation for the new gallery elements
            if (window.refreshScrollAnimations) {
                window.refreshScrollAnimations();
            }
        });
    });
})();


/* ═══════════════════════════════════════════════════════════
   11. SMART SPLINE MANAGEMENT (Extreme Efficiency)
═══════════════════════════════════════════════════════════ */
(function manageSpline() {
    // 1. Extreme Lazy Load + Unload (Free up GPU Memory)
    const lazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const viewer = entry.target;
            const url = viewer.getAttribute('data-url');
            const gallery = viewer.closest('.work__gallery');
            const isActiveGallery = gallery ? gallery.classList.contains('is-active') : true;

            if (entry.isIntersecting && isActiveGallery) {
                // Load model when entering view - with staggered delay to avoid thread lock
                if (url && !viewer.getAttribute('url')) {
                    const delay = Math.random() * 300;
                    setTimeout(() => {
                        // Double check visibility before loading
                        if (!viewer.getAttribute('url') && gallery.classList.contains('is-active')) {
                            viewer.setAttribute('url', url);
                            viewer.setAttribute('hint', 'performance');
                        }
                    }, delay);
                }
            } else {
                // Unload model when leaving view or gallery is hidden to keep GPU clean
                if (viewer.getAttribute('url')) {
                    viewer.removeAttribute('url');
                }
            }
        });
    }, { threshold: 0.01, rootMargin: '500px' });

    // Listen for tab changes to trigger re-evaluation
    document.querySelectorAll('.work__tab').forEach(tab => {
        tab.addEventListener('click', () => {
            setTimeout(() => {
                document.querySelectorAll('spline-viewer').forEach(v => {
                    lazyObserver.unobserve(v);
                    lazyObserver.observe(v);
                });
            }, 450); // Small delay for tab transition to start
        });
    });

    // 2. Branding Removal & Context Management
    const mutationObserver = new MutationObserver(() => {
        const viewers = document.querySelectorAll('spline-viewer');
        viewers.forEach(viewer => {
            lazyObserver.observe(viewer);

            if (viewer.shadowRoot && !viewer.shadowRoot.querySelector('.logo-hidden-style')) {
                const s = document.createElement('style');
                s.classList.add('logo-hidden-style');
                s.innerHTML = `
                    #logo, .spline-logo, a[href*="spline.design"], #logo + div { 
                        display: none !important; opacity: 0 !important; visibility: hidden !important; 
                    }
                `;
                viewer.shadowRoot.appendChild(s);
            }
        });
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
})();

/* 12. HERO CONTACT BUTTON SCROLL */
document.getElementById('card-contact-btn')?.addEventListener('click', () => {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
});

/* 13. INQUIRY FORM HANDLER */
(function initInquiryForm() {
    const form = document.getElementById('inquiry-form');
    if (!form) return;

    // Service Chip Selection
    const chips = form.querySelectorAll('.service-chip');
    const hiddenInput = document.getElementById('selected-service');

    chips.forEach(chip => {
        const handleSelect = () => {
            chips.forEach(c => c.classList.remove('is-active'));
            chip.classList.add('is-active');
            if (hiddenInput) hiddenInput.value = chip.dataset.value;
        };

        chip.addEventListener('click', handleSelect);
        chip.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSelect();
            }
        });
    });

    // Unified Inquiry Form Submission
    // We use a regular form submission instead of AJAX to ensure compatibility 
    // with the file:// protocol and FormSubmit's activation flow.
    form.addEventListener('submit', () => {
        const btn = form.querySelector('.inquiry-submit');

        // Visual feedback before the page redirects
        btn.disabled = true;
        btn.innerHTML = '<span>Verifying...</span><div class="spinner"></div>';
        btn.classList.add('btn--loading');

        // Standard submission follows automatically
    });

    // Ensure icons are created
    if (window.lucide) {
        window.lucide.createIcons();
    }
})();

