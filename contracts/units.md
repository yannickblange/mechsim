# Units and conventions (frozen for v0.1; v0.2 additions at the end)

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
