// ── Shader stage: the GPU half of Graphic Export ─────────────────────────────
// A WebGL2 renderer that stands in for CaptureCore when the panel's source is
// a shader twin. Same shape as the core from the worker's side — reset,
// setKnobs, step(dt, geometry) — so the export paths (still, clip, Director
// automation, warm-up) drive either one without knowing which.
//
// Two passes at most, both from the ONE source the user pasted:
//   mainState   optional, ping-ponged through a pair of textures — this is
//               what makes a simulation possible at output size: the state IS
//               the frame, so a 4K take integrates 8 M cells instead of
//               stretching a 128×64 grid over them.
//   mainImage   required, drawn to the canvas the painter picks up.
// State textures are RGBA16F where the driver renders float and RGBA8 where it
// does not; the difference matters for feedback that accumulates, so the stage
// reports which it got rather than quietly losing precision.
//
// The canvas is straight-alpha (premultipliedAlpha: false): a shader that
// writes alpha gets a transparent PNG through the same backdrop control the
// pattern path uses.

import type { CaptureGeometry } from "./types";
import { SHADER_RAMP_SIZE } from "./shaderRamp";
import {
  SHADER_VERTEX_SOURCE,
  buildFragmentSource,
  checkShaderSource,
  remapShaderLog,
  type ShaderPass,
} from "./shaderSource";

export type ShaderFrame = {
  geometry: CaptureGeometry;
  /** The picture at `geometry.render`, for the painter to place. */
  canvas: OffscreenCanvas;
  renderMs: number;
  time: number;
};

type Programs = {
  source: string;
  image: WebGLProgram | null;
  state: WebGLProgram | null;
  error: string | null;
};

const KNOB_COUNT = 4;

export class ShaderStage {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: OffscreenCanvas | null = null;
  private programs: Programs | null = null;
  private source: string | null = null;
  /** Set when the GPU itself is unavailable (compile faults live on programs). */
  private failure: string | null = null;

  private textures: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private framebuffer: WebGLFramebuffer | null = null;
  // The colour ramp as a 1-row texture. Held as bytes so a ramp that arrives
  // before the context exists is still waiting when it does.
  private rampLut: Uint8Array | null = null;
  private rampTexture: WebGLTexture | null = null;
  private rampSmooth = true;
  private rampDirty = false;
  private stateWidth = 0;
  private stateHeight = 0;
  private read = 0;
  private floatState = false;

  private knobs = new Float32Array(KNOB_COUNT);
  private knobsNorm = new Float32Array(KNOB_COUNT);
  private btnPressed = new Float32Array(KNOB_COUNT);
  private btnHeld = new Float32Array(KNOB_COUNT);

  time = 0;
  private frame = 0;

  constructor(private readonly makeCanvas: (width: number, height: number) => OffscreenCanvas) {}

  /** Compile error, GPU failure, or null when the stage is healthy. */
  get error(): string | null {
    return this.failure ?? this.programs?.error ?? null;
  }

  get hasSource(): boolean {
    return this.source !== null;
  }

  /** False once the stage has run without float render targets. */
  get floatFeedback(): boolean {
    return this.floatState;
  }

  setSource(source: string | null) {
    const next = source && source.trim() ? source : null;
    if (next === this.source) return;
    this.source = next;
    this.disposePrograms();
    this.failure = null;
    this.reset();
  }

  /**
   * Swap the ramp the `ramp()` helper reads. Cheap on purpose: one 4 KB
   * upload, no recompile, so dragging a stop repaints the stage live.
   *
   * `smooth` interpolates between entries — right for every ramp mode except
   * "step", where the point IS the hard edge and blending across it would put
   * a seam of in-between colour the panel never shows.
   */
  setRamp(lut: Uint8Array, smooth = true) {
    this.rampLut = lut;
    this.rampSmooth = smooth;
    this.rampDirty = true;
  }

  setKnobs(values: number[], normalized: number[]) {
    for (let index = 0; index < KNOB_COUNT; index++) {
      this.knobs[index] = values[index] ?? 0;
      this.knobsNorm[index] = normalized[index] ?? 0;
    }
  }

  pressButton(index: number) {
    if (index < 0 || index >= KNOB_COUNT) return;
    if (this.btnHeld[index]) return;
    this.btnHeld[index] = 1;
    this.btnPressed[index] = 1;
  }

  releaseButton(index: number) {
    if (index < 0 || index >= KNOB_COUNT) return;
    this.btnHeld[index] = 0;
  }

  releaseAllButtons() {
    this.btnHeld.fill(0);
  }

  /** Fresh take: time zero, frame zero, feedback cleared. */
  reset() {
    this.time = 0;
    this.frame = 0;
    this.clearState();
  }

  /**
   * Compile now rather than at the first frame, so a paste is answered while
   * the viewfinder is off. Returns the error, or null when it built.
   */
  prepare(): string | null {
    if (!this.source) return null;
    const gl = this.context(1, 1);
    if (!gl) return this.failure;
    return this.compile(gl, this.source).error;
  }

  /** Whether the loaded source runs a feedback pass. */
  get hasFeedback(): boolean {
    return this.programs?.state !== null && this.programs?.state !== undefined;
  }

  step(dt: number, geometry: CaptureGeometry): ShaderFrame | null {
    if (!this.source) return null;
    const startedAt = performance.now();
    const { width, height } = geometry.render;
    const gl = this.context(width, height);
    if (!gl || !this.canvas) return null;
    const programs = this.compile(gl, this.source);
    if (!programs.image) return null;

    this.time += dt;
    this.ensureState(gl, width, height);
    this.ensureRamp(gl);

    if (programs.state && this.framebuffer) {
      const write = 1 - this.read;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.textures[write],
        0,
      );
      this.draw(gl, programs.state, width, height, this.textures[this.read]);
      this.read = write;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.draw(gl, programs.image, width, height, this.textures[this.read]);
    gl.flush();

    this.btnPressed.fill(0);
    this.frame++;
    return {
      geometry,
      canvas: this.canvas,
      renderMs: performance.now() - startedAt,
      time: this.time,
    };
  }

  dispose() {
    this.disposePrograms();
    const gl = this.gl;
    if (gl) {
      for (const texture of this.textures) if (texture) gl.deleteTexture(texture);
      if (this.rampTexture) gl.deleteTexture(this.rampTexture);
      if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    }
    this.textures = [null, null];
    this.rampTexture = null;
    this.rampDirty = true;
    this.framebuffer = null;
    this.gl = null;
    this.canvas = null;
  }

  // ── internals ──

  private context(width: number, height: number): WebGL2RenderingContext | null {
    if (this.failure) return null;
    if (!this.gl) {
      if (typeof OffscreenCanvas === "undefined") {
        this.failure = "This browser has no OffscreenCanvas for the shader stage.";
        return null;
      }
      const canvas = this.makeCanvas(Math.max(1, width), Math.max(1, height));
      const gl = canvas.getContext("webgl2", {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        // The painter reads the canvas right after the draw; without this the
        // buffer can already be gone on some drivers.
        preserveDrawingBuffer: true,
      }) as WebGL2RenderingContext | null;
      if (!gl) {
        this.failure = "WebGL2 is unavailable here — the shader stage needs it.";
        return null;
      }
      this.floatState = gl.getExtension("EXT_color_buffer_float") !== null;
      this.canvas = canvas;
      this.gl = gl;
    }
    const canvas = this.canvas!;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return this.gl;
  }

  private compile(gl: WebGL2RenderingContext, source: string): Programs {
    if (this.programs && this.programs.source === source) return this.programs;
    this.disposePrograms();

    const fail = (error: string): Programs => {
      this.programs = { source, image: null, state: null, error };
      return this.programs;
    };

    const check = checkShaderSource(source);
    if (!check.ok) return fail(check.error);

    const vertex = this.shader(gl, gl.VERTEX_SHADER, SHADER_VERTEX_SOURCE);
    if (typeof vertex === "string") return fail(vertex);

    const image = this.program(gl, vertex, source, "image");
    if (typeof image === "string") {
      gl.deleteShader(vertex);
      return fail(image);
    }

    let state: WebGLProgram | null = null;
    if (check.hasState) {
      const built = this.program(gl, vertex, source, "state");
      if (typeof built === "string") {
        gl.deleteShader(vertex);
        gl.deleteProgram(image);
        return fail(built);
      }
      state = built;
    }

    gl.deleteShader(vertex);
    this.programs = { source, image, state, error: null };
    return this.programs;
  }

  /** A compiled shader, or the driver's log remapped to the user's lines. */
  private shader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | string {
    const shader = gl.createShader(type);
    if (!shader) return "The GPU refused to create a shader.";
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    const log = remapShaderLog(gl.getShaderInfoLog(shader) ?? "Compile failed.");
    gl.deleteShader(shader);
    return log;
  }

  private program(
    gl: WebGL2RenderingContext,
    vertex: WebGLShader,
    source: string,
    pass: ShaderPass,
  ): WebGLProgram | string {
    const fragment = this.shader(gl, gl.FRAGMENT_SHADER, buildFragmentSource(source, pass));
    if (typeof fragment === "string") return `${pass} pass — ${fragment}`;
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(fragment);
      return "The GPU refused to create a program.";
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(fragment);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
    const log = remapShaderLog(gl.getProgramInfoLog(program) ?? "Link failed.");
    gl.deleteProgram(program);
    return `${pass} pass — ${log}`;
  }

  private draw(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    width: number,
    height: number,
    state: WebGLTexture | null,
  ) {
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    const at = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform2f(at("uResolution"), width, height);
    gl.uniform1f(at("uTime"), this.time);
    gl.uniform1i(at("uFrame"), this.frame);
    gl.uniform4fv(at("uKnob"), this.knobs);
    gl.uniform4fv(at("uKnobNorm"), this.knobsNorm);
    gl.uniform4fv(at("uBtnPressed"), this.btnPressed);
    gl.uniform4fv(at("uBtnHeld"), this.btnHeld);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, state);
    gl.uniform1i(at("uState"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.rampTexture);
    gl.uniform1i(at("uRamp"), 1);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private ensureState(gl: WebGL2RenderingContext, width: number, height: number) {
    if (this.stateWidth === width && this.stateHeight === height && this.textures[0]) return;
    for (const texture of this.textures) if (texture) gl.deleteTexture(texture);
    if (!this.framebuffer) this.framebuffer = gl.createFramebuffer();
    this.textures = [this.texture(gl, width, height), this.texture(gl, width, height)];
    this.stateWidth = width;
    this.stateHeight = height;
    this.read = 0;
    // Feedback is bound to its grid: a resized take starts its simulation over
    // rather than stretching the old one across a different lattice.
    this.frame = 0;
    this.clearState();
  }

  private ensureRamp(gl: WebGL2RenderingContext) {
    if (!this.rampTexture) {
      this.rampTexture = gl.createTexture();
      this.rampDirty = true;
      // A shader that calls ramp() before one arrives gets white, not garbage.
      if (!this.rampLut) this.rampLut = new Uint8Array(SHADER_RAMP_SIZE * 4).fill(255);
    }
    if (!this.rampDirty || !this.rampLut || !this.rampTexture) return;
    this.rampDirty = false;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.rampTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      SHADER_RAMP_SIZE,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.rampLut,
    );
    // Interpolating between entries where the ramp interpolates: the runtime's
    // 256-step lookup is an 8-bit LED simulation and this is not one, so a
    // smooth ramp comes out smooth. A step ramp reads NEAREST instead.
    const filter = this.rampSmooth ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }

  private texture(gl: WebGL2RenderingContext, width: number, height: number): WebGLTexture | null {
    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (this.floatState) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    // Wrapping neighbour reads: an LED pattern's edges meet, and NEAREST keeps
    // a state texel a cell rather than a blend of four.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return texture;
  }

  private clearState() {
    const gl = this.gl;
    if (!gl || !this.framebuffer) return;
    for (const texture of this.textures) {
      if (!texture) continue;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.read = 0;
  }

  private disposePrograms() {
    const gl = this.gl;
    if (gl && this.programs) {
      if (this.programs.image) gl.deleteProgram(this.programs.image);
      if (this.programs.state) gl.deleteProgram(this.programs.state);
    }
    this.programs = null;
  }
}
