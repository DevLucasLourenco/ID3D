// Verificacao e reconstrucao de normais a partir da geometria.

// Fracao de triangulos cujas normais gravadas discordam muito da geometria (0 = coerentes).
export function normalMismatch(pos, nor) {
  var bad = 0, tot = 0;
  for (var i = 0; i + 8 < pos.length; i += 9) {
    var ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2];
    var vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
    var gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx, gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (!(gl > 0)) continue;
    tot++;
    for (var k = 0; k < 9; k += 3) {
      if (Math.abs(gx * nor[i + k] + gy * nor[i + k + 1] + gz * nor[i + k + 2]) < 0.26 * gl) { bad++; break; }
    }
  }
  return tot ? bad / tot : 0;
}
// Normais suaves calculadas da propria geometria (triangulos nao indexados), com angulo de vinco.
export function creaseNormals(pos, creaseDeg) {
  var nt = Math.floor(pos.length / 9), fn = new Float32Array(nt * 3), area = new Float32Array(nt), out = new Float32Array(nt * 9);
  var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], i, k, f;
  for (i = 0; i < pos.length; i++) { k = i % 3; if (pos[i] < mn[k]) mn[k] = pos[i]; if (pos[i] > mx[k]) mx[k] = pos[i]; }
  var diag = Math.sqrt(Math.pow(mx[0] - mn[0], 2) + Math.pow(mx[1] - mn[1], 2) + Math.pow(mx[2] - mn[2], 2)) || 1, q = 1 / (diag * 2e-6);
  for (f = 0; f < nt; f++) {
    i = f * 9;
    var ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2];
    var vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
    var gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx, gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
    area[f] = gl;
    if (gl > 0) { fn[f * 3] = gx / gl; fn[f * 3 + 1] = gy / gl; fn[f * 3 + 2] = gz / gl; }
  }
  var byPos = new Map(), keys = new Array(nt * 3);
  for (i = 0; i < nt * 3; i++) {
    var key = Math.round((pos[i * 3] - mn[0]) * q) + '_' + Math.round((pos[i * 3 + 1] - mn[1]) * q) + '_' + Math.round((pos[i * 3 + 2] - mn[2]) * q);
    keys[i] = key;
    var l = byPos.get(key); if (!l) byPos.set(key, l = []);
    l.push((i / 3) | 0);
  }
  var cosC = Math.cos((creaseDeg + 0.5) * Math.PI / 180);
  for (i = 0; i < nt * 3; i++) {
    f = (i / 3) | 0;
    var ax = fn[f * 3], ay = fn[f * 3 + 1], az = fn[f * 3 + 2], sx = 0, sy = 0, sz = 0, list = byPos.get(keys[i]);
    for (k = 0; k < list.length; k++) {
      var g = list[k], bx = fn[g * 3], by = fn[g * 3 + 1], bz = fn[g * 3 + 2], d = ax * bx + ay * by + az * bz;
      if (d >= cosC) { sx += bx * area[g]; sy += by * area[g]; sz += bz * area[g]; }
      else if (d <= -cosC) { sx -= bx * area[g]; sy -= by * area[g]; sz -= bz * area[g]; }
    }
    var sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
    if (sl > 0) { out[i * 3] = sx / sl; out[i * 3 + 1] = sy / sl; out[i * 3 + 2] = sz / sl; }
    else { out[i * 3] = ax; out[i * 3 + 1] = ay; out[i * 3 + 2] = az; }
  }
  return out;
}
