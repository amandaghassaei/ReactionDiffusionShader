//used a lot of ideas from https://bl.ocks.org/robinhouston/ed597847175cf692ecce to clean this code up

var gl;
var canvas;
var frameBuffers;
var states = [null, null];

var resizedLastState;
var resizedCurrentState;

var width;
var height;

var stepProgram;
var renderProgram;

var textureSizeLocation;
var textureSizeLocationRender;
var scaleLocationRender;

var mouseCoordLocation;
var mouseCoordinates =  [null, null];
var mouseEnableLocation;
var mouseEnable = true;

var sinks = [];
var sinksTexture;

var paused = false;//while window is resizing

window.onload = initGL;

function initGL() {

    $("#about").click(function(e){
        e.preventDefault();
        $("#aboutModal").modal('show');
    });

    // Get A WebGL context
    canvas = document.getElementById("glcanvas");
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    canvas.onmousemove = onMouseMove;
    canvas.onmousedown = onMouseDown;
    // canvas.onmouseup = onMouseUp;
    canvas.onmouseout = onMouseUp;
    canvas.onmouseenter = function(){
        mouseEnable = 1;
    };

    window.onresize = onResize;

    gl = canvas.getContext("webgl", {antialias:false}) || canvas.getContext("experimental-webgl", {antialias:false});
    if (!gl) {
        notSupported();
        return;
    }

    gl.disable(gl.DEPTH_TEST);

    var floatTextures = gl.getExtension("OES_texture_float");

    if (!floatTextures) {
       notSupported();
    }

    // setup a GLSL program
    stepProgram = createProgramFromScripts(gl, "2d-vertex-shader", "2d-fragment-shader");
    renderProgram = createProgramFromScripts(gl, "2d-vertex-shader", "2d-render-shader");
    gl.useProgram(renderProgram);
    loadVertexData(gl, renderProgram);
    textureSizeLocationRender = gl.getUniformLocation(renderProgram, "u_textureSize");
    scaleLocationRender = gl.getUniformLocation(renderProgram, "u_scale");
    gl.useProgram(stepProgram);
    loadVertexData(gl, stepProgram);

    textureSizeLocation = gl.getUniformLocation(stepProgram, "u_textureSize");
    mouseCoordLocation = gl.getUniformLocation(stepProgram, "u_mouseCoord");
    mouseEnableLocation = gl.getUniformLocation(stepProgram, "u_mouseEnable");

    gl.uniform1i(gl.getUniformLocation(stepProgram, "u_image"), 0);
    gl.uniform1i(gl.getUniformLocation(stepProgram, "u_sinks"), 1);


    frameBuffers = [makeFrameBuffer(), makeFrameBuffer()];

    resetWindow();
    makeSinksTexture();

    gl.bindTexture(gl.TEXTURE_2D, states[0]);//original texture

    render();

    var check = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (check != gl.FRAMEBUFFER_COMPLETE){
        notSupported();
    }
}

function loadVertexData(gl, program) {
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ -1,-1, 1,-1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    // look up where the vertex data needs to go.
	var positionLocation = gl.getAttribLocation(program, "a_position");
	gl.enableVertexAttribArray(positionLocation);
	gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
}

function makeFrameBuffer(){
    return gl.createFramebuffer();
}

function makeRandomArray(rgba){
    for (var x=0;x<width;x++) {
        for (var y=0;y<height;y++) {
            var ii = (y*width + x) * 4;
			var central_square = (x > width/2-10 && x < width/2+10 && y > height/2-10 && y < height/2+10);
			if (central_square) {
				rgba[ii] = 0.5 + Math.random() * 0.02 - 0.01;
				rgba[ii + 1] = 0.25 + Math.random() * 0.02 - 0.01;
			} else {
				rgba[ii] = 1.0;
				rgba[ii + 1] = 0;
			}
        }
    }
    return rgba;
}

function makeSinksTexture(){
    var data = new Float32Array(32*2*4);
    for (var i=0;i<data.length;i++){
        data[i] = -1;
    }
    for (var i=0;i<sinks.length;i++){
        data[2*i] = sinks[i][0];
        data[2*i+1] = sinks[i][1];
    }
    sinksTexture = makeTexture(gl, data, 32, 2);
}

function makeTexture(gl, data, _width, _height){

    _width = _width || width;
    _height = _height || height;

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set the parameters so we can render any size image.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, _width, _height, 0, gl.RGBA, gl.FLOAT, data);

    return texture;
}

function render(){

    if (!paused) {

        gl.viewport(0, 0, width, height);
        gl.useProgram(stepProgram);

        if (mouseEnable){
            gl.uniform1f(mouseEnableLocation, 1);
            gl.uniform2f(mouseCoordLocation, mouseCoordinates[0], mouseCoordinates[1]);
        } else gl.uniform1f(mouseEnableLocation, 0);

        if (resizedLastState) {
            states[0] = resizedLastState;
            gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffers[0]);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, states[0], 0);
            resizedLastState = null;
        }
        if (resizedCurrentState) {
            states[1] = resizedCurrentState;
            gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffers[1]);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, states[1], 0);
            resizedCurrentState = null;
        }

        for (var i=0;i<20;i++) {
            if (paused) {
                window.requestAnimationFrame(render);
                return;
            }

            step(i);
        }


        gl.viewport(0, 0, canvas.clientWidth, canvas.clientHeight);
        gl.useProgram(renderProgram);

        //draw to canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, states[0]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    } else resetWindow();

    window.requestAnimationFrame(render);
}

function step(i){
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffers[(i+1)%2]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, states[i%2]);

    gl.activeTexture(gl.TEXTURE0+1);
    gl.bindTexture(gl.TEXTURE_2D, sinksTexture);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);//draw to framebuffer
}

function onResize(){
    paused = true;
}

var maxWidth = 700;
var maxHeight = 700;
var scalingFactor = 1;

function resetWindow(){
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    width = canvas.clientWidth;
    height = canvas.clientHeight;

    scalingFactor = 1;
    var widthScaling = 1;
    var heightScaling = 1;
    if (width > maxWidth) {
        widthScaling = maxWidth/width;
    }
    if (height > maxHeight){
        heightScaling = maxHeight/height;
    }
    if (widthScaling<heightScaling){
        scalingFactor = widthScaling;
    } else {
        scalingFactor = heightScaling;
    }
    width *= scalingFactor;
    height *= scalingFactor;
    width = Math.ceil(width);
    height = Math.ceil(height);

    gl.viewport(0, 0, width, height);

    // set the size of the texture
    gl.useProgram(stepProgram);
    gl.uniform2f(textureSizeLocation, width, height);
    gl.useProgram(renderProgram);
    gl.uniform2f(textureSizeLocationRender, canvas.clientWidth, canvas.clientHeight);
    gl.uniform1f(scaleLocationRender, scalingFactor);

    sinks = [];
    sinks.push([width/3, height/2]);
    sinks.push([2*width/3, height/2]);

    //texture for saving output from frag shader
    resizedCurrentState = makeTexture(gl, null);

    //fill with random pixels
    var rgba = new Float32Array(width*height*4);
    resizedLastState = makeTexture(gl, makeRandomArray(rgba));

    paused = false;
}

function onMouseMove(e){
    mouseCoordinates = [e.clientX*scalingFactor, height-e.clientY*scalingFactor];
}

function onMouseDown(e){
    gl.useProgram(stepProgram);
    mouseCoordinates = [e.clientX*scalingFactor, height-e.clientY*scalingFactor];
    var index = 1;
    if (mouseCoordinates[0]<width/2) index = 0;
    // sinks.push([mouseCoordinates[0], mouseCoordinates[1]]);
    sinks[index] = [mouseCoordinates[0], mouseCoordinates[1]];
    makeSinksTexture();
}

function onMouseUp(){
    mouseEnable = 0;
}

function notSupported(){
    var elm = '<div id="coverImg" ' +
      'style="background: url(reactiondiff.jpg) no-repeat center center fixed;' +
        '-webkit-background-size: cover;' +
        '-moz-background-size: cover;' +
        '-o-background-size: cover;' +
        'background-size: cover;">'+
      '</div>';
    $(elm).appendTo(document.getElementsByTagName("body")[0]);
    $("#noSupportModal").modal("show");
   console.warn("floating point textures are not supported on your system");
}