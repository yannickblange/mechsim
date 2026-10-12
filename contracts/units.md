# Units and conventions (frozen for v0.1; v0.2 and v0.3 / v0.3c additions at the end)

- **SI units everywhere**: m, kg, s, N, N·m, rad. No mm, no degrees inside the engine or JSON.
- **Coordinate system**: right-handed, x to the right, **y up**. Gravity is a vector, default `[0, -9.81]`.
- **Angles**: `phi` in rad, **counter-clockwise positive**. `omega = dphi/dt`.
- **Generalised coordinates per body**: `q = [x, y, phi]` = position of the **centre of mass** and rotation.
- **Global vector layout**: body with index `i` owns entries `3*i + 0` (x), `3*i + 1` (y), `3*i + 2` (phi).
- **Local points**: a point on a body is given in body-local coordinates relative to the centre of mass,
  rotated with the body: `p_world = pos + R(phi) * p_local`, with `R(phi) = [[cos, -sin], [sin, cos]]`.
- **Ground**: an anchor with `"body": null` is fixed to the world; its `point` is in **world** coordinates.
- **Scalar cross product**: `cross(a, b) = a.x*b.y - a.y*b.x` (z-component). Torque of force `F` at
  lever `r` (world-oriented, from the centre of mass): `tau = cross(r, F)`.
- **Spring force sign**: positive = tension (spring pulls its end points together).
- **Constraint reactions**: the force (and moment) the support exerts **on the body**.
- **Energy**: gravity potential `V = -m * dot(g, pos)`, spring potential `V = 0.5 * k * (L - L0)^2`.

## v0.2 additions

- **Loads** (`load` element): `force` is a world-frame vector and does **not** rotate with the body;
  `moment` is a couple, counter-clockwise positive. Constant loads are N and N m; an **impulse** is N s
  and N m s and acts once at t = 0 (and again after every reset) as a velocity jump
  `dv = J / m`, `domega = (cross(r, J) + L) / J_body`, projected onto the constraints. A constant
  load is conservative: `V = -F . p - M phi`.
- **Discs**: `radius` in m, `J = m r^2 / 2`.
- **Surfaces**: fixed line segments `p1 -> p2` in world coordinates. Geometry only: supports sit on them,
  bodies do not collide with them. The hatching is drawn on the right-hand side of `p1 -> p2`.
- **Support `params.angle`**: direction of the supporting surface in rad (counter-clockwise from +x),
  chosen so that the body lies on the **left** of that direction (angle 0 = floor below the body,
  pi = ceiling above it). The Loslager slides along this direction and its reaction is along the normal
  `n = (-sin angle, cos angle)`; Festlager and fixed Lager use it for the symbol only.
- **Reactions**: `pin_support` and `roller_support` report `[Fx, Fy]`, `fixed_support` reports
  `[Fx, Fy, M]` (force and moment the support exerts on the body, M about the support point).
  `roller_support.position` is the current world position of the sliding body point; the other supports
  report their fixed world position.
- **Spring `rest_length`**: the relaxed length (the editor's "ghost"). If it is shorter than the
  installed length the spring starts in tension, if longer in compression.

## v0.3 additions

- **Rope** (`rope`, a constraint): `|p_b - p_a| <= length`, tension only, infinitely strong (it never stretches).
  `params.length` (m) defaults to the initial distance (taut) and must not be smaller; a larger value
  starts the rope slack. A slack rope exerts no force. When it becomes taut the velocity that would
  stretch it is removed at once (inelastic: energy is lost, no bounce). Frame: `force` (N, >= 0),
  `taut` (false while slack), `length`.
- **Stab / rod** (`rod`, a constraint): a massless two-force member, `|p_b - p_a| = L` with `L` the initial
  distance. It carries tension **and** compression; frame `force` is tension positive, so a rod in
  compression is negative.
- Rope and rod ends are `{body, point}` anchors like a spring's (`body: null` = world point). At least one
  end is on a mass and the two ends are on different masses. Frame `reaction` is the force on end b.
- **Attachments are fixed to the mass.** Every body-local anchor (spring, rope, rod, support, load)
  moves with its mass and does not slide; the end of a rope or rod is a hinge.
- **Joints** (`pin_joint`, `fixed_joint`): between two different masses, anchors `a` and `b` that coincide at
  t = 0 (otherwise the solver pulls them together at the start). `pin_joint` is a hinge, `fixed_joint` also
  fixes the relative angle. Frame `reaction` is the force (and for `fixed_joint` the moment) on the mass of `a`.
- **Festlager in free space**: `pin_support` with `body: null` and a **world** point. It has no equations of its
  own; it marks a fixed point that spring, rope and rod ends are attached to (as ground anchors at the same
  point) and that the editor's joint tool can pin a mass to. Its reaction is reported as `[0, 0]`.

## v0.3c addition

- **Damper** (`damper`, an element like the spring): ends are `{body, point}` anchors, at least one end on a mass, the two ends
  on different masses. `params.c` in N s / m (>= 0). The force along the axis is `F = c * dL/dt` with `dL/dt = u . (v_b - v_a)`,
  `u = (p_b - p_a) / |p_b - p_a|`: tension positive (the ends move apart), compression negative, so it always resists the
  relative motion. Force on a: `+F u`, on b: `-F u`. It has no relaxed length and stores no energy (it dissipates `c (dL/dt)^2`),
  so the total energy of a system with a damper decreases. Frame: `p1`, `p2`, `force`.
