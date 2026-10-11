# Units and conventions (frozen for v0.1)

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
