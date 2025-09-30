/* GLOBAL CONSTANTS AND VARIABLES */

/* assignment specific globals */
const WIN_Z = 0; // default graphics window z coord in world space
const WIN_LEFT = 0;
const WIN_RIGHT = 1; // default left and right x coords in world space
const WIN_BOTTOM = 0;
const WIN_TOP = 1; // default top and bottom y coords in world space
const INPUT_TRIANGLES_URL =
  "https://ncsucgclass.github.io/prog2/triangles.json"; // triangles file loc
const INPUT_SPHERES_URL = "https://ncsucgclass.github.io/prog2/spheres.json"; // spheres file loc
var Eye = new vec4.fromValues(0.5, 0.5, -0.5, 1.0); // default eye position in world space

/* webgl globals */
var gl = null; // the all powerful gl object. It's all here folks!
var vertexBuffer; // this contains vertex coordinates in triples
var triangleBuffer; // this contains indices into vertexBuffer in triples
var triBufferSize; // the number of indices in the triangle buffer
var inputTriangles;
var shaderProgram;
var colorBuffer;
let part5 = false;

// ASSIGNMENT HELPER FUNCTIONS

// get the JSON file from the passed URL
function getJSONFile(url, descr) {
  try {
    if (typeof url !== "string" || typeof descr !== "string")
      throw "getJSONFile: parameter not a string";
    else {
      var httpReq = new XMLHttpRequest(); // a new http request
      httpReq.open("GET", url, false); // init the request
      httpReq.send(null); // send the request
      var startTime = Date.now();
      while (
        httpReq.status !== 200 &&
        httpReq.readyState !== XMLHttpRequest.DONE
      ) {
        if (Date.now() - startTime > 3000) break;
      } // until its loaded or we time out after three seconds
      if (httpReq.status !== 200 || httpReq.readyState !== XMLHttpRequest.DONE)
        throw "Unable to open " + descr + " file!";
      else return JSON.parse(httpReq.response);
    } // end if good params
  } catch (e) {
    // end try

    console.log(e);
    return null;
  }
} // end get input spheres

// set up the webGL environment
function setupWebGL() {
  // Get the canvas and context
  var canvas = document.getElementById("myWebGLCanvas"); // create a js canvas
  gl = canvas.getContext("webgl"); // get a webgl object from it

  try {
    if (gl == null) {
      throw "unable to create gl context -- is your browser gl ready?";
    } else {
      gl.clearColor(0.0, 0.0, 0.0, 1.0); // use black when we clear the frame buffer
      gl.clearDepth(1.0); // use max when we clear the depth buffer
      gl.enable(gl.DEPTH_TEST); // use hidden surface removal (with zbuffering)
    }
  } catch (e) {
    // end try

    console.log(e);
  } // end catch
} // end setupWebGL

// read triangles in, load them into webgl buffers
function loadTriangles() {
  inputTriangles = getJSONFile(INPUT_TRIANGLES_URL, "triangles");
  if (inputTriangles != String.null) {
    var whichSetVert; // index of vertex in current triangle set
    var whichSetTri; // index of triangle in current triangle set
    var coordArray = []; // 1D array of vertex coords for WebGL

    for (var whichSet = 0; whichSet < inputTriangles.length; whichSet++) {
      // set up the vertex coord array
      for (
        whichSetVert = 0;
        whichSetVert < inputTriangles[whichSet].vertices.length;
        whichSetVert++
      ) {
        coordArray = coordArray.concat(
          inputTriangles[whichSet].vertices[whichSetVert]
        );
        // console.log(inputTriangles[whichSet].vertices[whichSetVert]);
      }
    } // end for each triangle set
    // console.log(coordArray.length);
    // send the vertex coords to webGL
    vertexBuffer = gl.createBuffer(); // init empty vertex coord buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer); // activate that buffer
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(coordArray),
      gl.STATIC_DRAW
    ); // coords to that buffer
    loadTriangleIndices(inputTriangles);
  } // end if triangles found
} // end load triangles

function loadTriangleIndices(inputTriangles) {
  let indexArray = [];
  let vertexSetOffset = 0;

  for (let whichSet = 0; whichSet < inputTriangles.length; whichSet++) {
    let triangles = inputTriangles[whichSet].triangles;
    for (let t = 0; t < triangles.length; t++) {
      // add vertexSetOffset to each index
      indexArray.push(triangles[t][0] + vertexSetOffset);
      indexArray.push(triangles[t][1] + vertexSetOffset);
      indexArray.push(triangles[t][2] + vertexSetOffset);
    }
    vertexSetOffset += inputTriangles[whichSet].vertices.length;
  }

  // send to GPU
  triangleBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indexArray),
    gl.STATIC_DRAW
  );

  triBufferSize = indexArray.length; // store the number of indices
}

// setup the webGL shaders
function setupShaders() {
  // define fragment shader in essl using es6 template strings
  var fShaderCode = `
        precision mediump float;

        varying vec3 fragColor;

        uniform float time;
        uniform bool part5;

        void main(void) {
            if (part5) {
                // animated, trippy colors
                vec3 animatedColor = vec3(
                    abs(sin(time * 0.2 + gl_FragCoord.x * 0.01)),
                    abs(sin(time * 0.2 + gl_FragCoord.y * 0.01)),
                    abs(cos(time * 0.2))
                );
                gl_FragColor = vec4(animatedColor * fragColor, 1.0);
            } else {
                // default look
                gl_FragColor = vec4(fragColor, 1.0);
            }
        }
    `;

  // define vertex shader in essl using es6 template strings
  var vShaderCode = `
        precision mediump float;

        attribute vec3 vertexPosition;
        attribute vec3 vertexColor;

        uniform float time;
        uniform bool part5;

        varying vec3 fragColor;

        void main(void) {
            vec3 pos = vertexPosition;

            if (part5) {
                // small, slow oscillation
                float offset = 0.05 * sin(time + vertexPosition.x * 5.0 + vertexPosition.y * 5.0);
                pos += vec3(offset, offset, 0.0);
            }

            gl_Position = vec4(pos, 1.0);
            fragColor = vertexColor;
        }
    `;

  try {
    // console.log("fragment shader: "+fShaderCode);
    var fShader = gl.createShader(gl.FRAGMENT_SHADER); // create frag shader
    gl.shaderSource(fShader, fShaderCode); // attach code to shader
    gl.compileShader(fShader); // compile the code for gpu execution

    // console.log("vertex shader: "+vShaderCode);
    var vShader = gl.createShader(gl.VERTEX_SHADER); // create vertex shader
    gl.shaderSource(vShader, vShaderCode); // attach code to shader
    gl.compileShader(vShader); // compile the code for gpu execution

    if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) {
      // bad frag shader compile
      throw (
        "error during fragment shader compile: " + gl.getShaderInfoLog(fShader)
      );
      gl.deleteShader(fShader);
    } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) {
      // bad vertex shader compile
      throw (
        "error during vertex shader compile: " + gl.getShaderInfoLog(vShader)
      );
      gl.deleteShader(vShader);
    } else {
      // no compile errors
      shaderProgram = gl.createProgram(); // create the single shader program
      gl.attachShader(shaderProgram, fShader); // put frag shader in program
      gl.attachShader(shaderProgram, vShader); // put vertex shader in program
      gl.linkProgram(shaderProgram); // link program into gl context

      if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        // bad program link
        throw (
          "error during shader program linking: " +
          gl.getProgramInfoLog(shaderProgram)
        );
      } else {
        // no shader program link errors
        gl.useProgram(shaderProgram); // activate shader program (frag and vert)
      } // end if no shader program link errors
    } // end if no compile errors
  } catch (e) {
    // end try

    console.log(e);
  } // end catch
} // end setup shaders

function setupColorBuffer() {
  let colorArray = [];

  for (let whichSet = 0; whichSet < inputTriangles.length; whichSet++) {
    const triangle = inputTriangles[whichSet];

    for (let v = 0; v < triangle.vertices.length; v++) {
      colorArray = colorArray.concat(triangle.material.diffuse); // repeat per vertex
    }
  }

  colorBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colorArray), gl.STATIC_DRAW);
}

function animate() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // vertex buffer
  const vertexPositionAttrib = gl.getAttribLocation(
    shaderProgram,
    "vertexPosition"
  );
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.vertexAttribPointer(vertexPositionAttrib, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(vertexPositionAttrib);

  // color buffer
  const vertexColorAttrib = gl.getAttribLocation(shaderProgram, "vertexColor");
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.vertexAttribPointer(vertexColorAttrib, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(vertexColorAttrib);

  // update uniforms
  const timeUniform = gl.getUniformLocation(shaderProgram, "time");
  const part5Uniform = gl.getUniformLocation(shaderProgram, "part5");
  let now = performance.now() / 1000;
  gl.uniform1f(timeUniform, now);
  gl.uniform1i(part5Uniform, part5 ? 1 : 0);

  // draw
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffer);
  gl.drawElements(gl.TRIANGLES, triBufferSize, gl.UNSIGNED_SHORT, 0);

  requestAnimationFrame(animate);
}

/* MAIN -- HERE is where execution begins after window load */

function main() {
  document.addEventListener("keydown", function (event) {
    if (!part5 && event.code === "Space") {
      part5 = true;
    }
  });

  setupWebGL(); // set up the webGL environment
  loadTriangles(); // load in the triangles from tri file
  setupShaders(); // setup the webGL shaders
  setupColorBuffer();
  animate(); // draw the triangles using webGL
} // end main
