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

## v0.4 additions

- **Node** (`node`, a body): a point mass (`params.mass`, kg) where Stabs meet. Stabs, supports and loads attach at its centre,
  `[0, 0]`. Its inertia is that of a disc of radius 0.05 m (the rotation is irrelevant). The editor makes nodes at the free ends of
  Stabs: **a Stab is never pinned to empty space** (a Stab end with `"body": null` is a ground anchor, which in the editor exists
  only on a Festlager in free space).
- **Material**: one for every bar and beam, steel: Young's modulus **E = 210 GPa**, density **7850 kg/m^3** (default mass of a beam).
- **Cross sections** (`section`, dimensions in m): `square` (`a`), `L` (`b`, `h`, `t`), `T` (`b`, `h`, `tf`, `tw`), `I` (`b`, `h`, `tf`, `tw`),
  `H` (`b`, `h`, `tf`, `tw`). Seen along the member axis, "up" is the in-plane direction normal to the axis (the direction of
  bending) and z the out-of-plane one: the L has a leg of height `h` up and a foot of width `b` at the bottom; the T a flange (`b`
  wide, `tf` thick) on top of a stem (`tw` wide), total height `h`; the I two flanges (`b`, `tf`) at the top and bottom of a web (`tw`);
  the H is the I turned by 90 degrees (weak axis). Bending in the simulation plane is about z: **I = integral of y^2 dA** about the
  centroid, y along "up". The product of inertia of the L is neglected. The axis of a member is the line of the centroids.
- **Bar** (`bar`, an element): an elastic Stab of steel, pinned at both anchors, axial stiffness `E A / L0` (`L0` the installed
  length: it starts unstressed). The rigid `rod` stays a constraint (massless, never bends or buckles). Since **v0.4b** a bar is a
  beam-column: `params.segments` (default 4; **1 = the pure axial bar of v0.4, massless**) beam elements with hidden internal nodes that
  carry its mass (`params.mass`, default density x A x L), so it bends under its own weight and **buckles** in the plane at the Euler load
  `P_cr = pi^2 E I / L^2` (I about the axis normal to the plane, the section's I). `params.imperfection` (default 1e-5) is the initial bow as a
  fraction of the length. Frame: `p1`, `p2`, `force` (the normal force of the element that carries the most, tension positive), `stress`
  (largest normal stress, axial plus bending; with one segment |force| / A), `nodes` (`[x, y, phi]` from end a to end b, the bent shape) and
  `pcr` (the Euler load): the bar has buckled when `-force` reaches `pcr`.
- **Damping** (`params.damping` of `node`, `beam` and `bar`, 1/s): viscous damping rate alpha, force `-alpha m v` and torque `-alpha J omega` on every node
  (a bar: its internal nodes). Every mode decays like `exp(-alpha t / 2)`; a load applied suddenly settles at its static response instead of
  swinging for ever. It acts on rigid-body motion too. Default 0 in the engine; the editor gives new beams and elastic Stabs 5 / s.
- **Beam** (`beam`, a body): `params.length`, `params.section`, optional `params.mass` (default density x A x L) and `params.segments`
  (finite elements, default 8). It lies along its local x axis; `position` is the point of the centroid axis at the middle, `angle`
  the direction of the axis. Attachments (`body: <beam>`, body-local `point`, x within +-length/2) may be anywhere along it; the
  engine gives the beam a node at each of them. Frame: `x`, `y`, `phi` of the middle, `nodes` (`[x, y, phi]` of every node),
  `moments` (bending moment at every node, N m, **sagging positive**), `axial` (normal force per segment, tension positive),
  `stress` (largest normal stress: axial plus bending, linear elastic, no yielding), `A`, `I`, `EA`, `EI`.
- **Harmonic load** (`load` with `mode: "harmonic"`): `force` and `moment` are amplitudes, `frequency` f in Hz (angular frequency
  Omega = 2 pi f), `phase` in rad: `F(t) = force * sin(2 pi f t + phase)`, the direction fixed in the world. Frames report the
  instantaneous `vector` and `moment`, `force` is the amplitude. A harmonic load depends on time and does work on the system: it
  has no potential and the energy is not conserved.
- **Displacement graphs** (frontend): displacement = pose minus the pose at the start of the recording (t = 0), x and y in m (shown
  in mm below 5 cm), rotation in degrees.
- **Scene `view.bend`** (1, 10, 50 or 200): display only, shows the bending of beams that many times as large.
