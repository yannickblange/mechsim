# Equations of motion (v0.1, extended in v0.2 and v0.3)

## Coordinates

Each body i has `q_i = [x_i, y_i, φ_i]` (centre of mass and rotation). The global vector stacks
them: `q = [q_0, q_1, …]`, size `n = 3 N`. Mass matrix (diagonal):
`M = diag(m_0, m_0, J_0, m_1, m_1, J_1, …)`.

Block inertia about the centre of mass: `J = m (w² + h²) / 12`.

## Forces

Generalised force per body: `f_i = [F_x, F_y, τ]`, accumulated from gravity `m g` (at the centre
of mass) and force elements. A force `F` at body-local point `p` adds `F` to the force and
`cross(R(φ) p, F)` to the torque.

Linear spring between anchors a and b: `d = p_b − p_a`, `L = |d|`, `u = d / L`,
`F = k (L − L0)` (tension positive). Force on a: `+F u`, on b: `−F u`. Potential: `½ k (L − L0)²`.

## Constraints (Lagrange multipliers)

```
M q̈ = f + Gᵀ λ
G q̈ = γ
```

λ is the force the constraints exert on the bodies, so the Lagerreaktionen are read directly
from λ.

### Festlager (pin_support), body i, local point p, fixed world point p₀

With `r = R(φ_i) p`:

```
C  = x_i + r − p₀                       (2 equations)
Ċ  = v_i + ω_i perp(r)                  perp(r) = [−r_y, r_x]
C̈  = a_i + α_i perp(r) − ω_i² r
```

Rows of G (columns of body i: x, y, φ):

```
[ 1  0  −r_y ]
[ 0  1   r_x ]
```

`γ₀ = ω_i² r`. Baumgarte stabilisation (drift correction):
`γ = γ₀ − 2 α Ċ − β² C`, with α, β from `solver.baumgarte_alpha/beta` (default 5).

### Fixed Lager / Einspannung (fixed_support), v0.2

Festlager rows plus the angle: `C = [x_i + r - p0, phi_i - phi0]` (3 equations).

```
G = [ 1  0  −r_y ]      γ = [ ω² r − 2 α Ċ_xy − β² C_xy ]
    [ 0  1   r_x ]          [ −2 α ω − β² (phi − phi0)  ]
    [ 0  0   1   ]
```

λ = [Fx, Fy, M]: the force and moment the support exerts on the body (the moment acts about the
support point, because the force acts at it).

### Loslager (roller_support), v0.2

The body point may only move along the surface line through `p0` with direction `t = (cos a, sin a)`;
`n = (−sin a, cos a)` is the normal. One equation, no friction:

```
C  = n · (x_i + r − p0)
Ċ  = n · (v_i + ω_i perp(r))
G  = [ n_x  n_y  n · perp(r) ]       γ₀ = ω² n · r      γ = γ₀ − 2 α Ċ − β² C
```

The reaction is `λ n`. The supported point slides, so the rotation of the body is free; a body with a
single Loslager can tip over. Two Loslager on the same surface keep it from tipping.

### Damper (damper), v0.3c

Viscous element between two anchors, `u = (p_b − p_a)/|p_b − p_a|`, anchor velocities `v_a`, `v_b`:

```
F = c u · (v_b − v_a)          force on a: +F u at the anchor point, on b: −F u   (c ≥ 0, tension positive)
```

Dissipated power `c (dL/dt)²`, no potential energy. The velocities at the start of the step are used (explicit
damping), so the semi-implicit Euler scheme stays stable while `c dt / m_eff < 2` (at dt = 1 ms: `c / m < 2000 1/s`); beyond that
the damping overshoots and the motion oscillates numerically.

### Stab and rope (rod, rope), v0.3

Two anchors, world positions `p_a`, `p_b`, anchor velocities `v_a`, `v_b`, `d = p_b − p_a`, `u = d/|d|`,
`v_r = v_b − v_a`. One equation with the multiplier equal to the axial force (tension positive):

```
C  = L − |d|
Ċ  = −u · v_r
C̈  = −u · (a_b − a_a) − (|v_r|² − (u · v_r)²) / |d|        a_p = a_i + α perp(r) − ω² r
G  = +u on body a, −u on body b  (columns x, y, φ: [u, u · perp(r)])
γ₀ = −u · (ω_b² r_b − ω_a² r_a) + (|v_r|² − (u · v_r)²) / |d|        γ = γ₀ − 2 α Ċ − β² C
```

`G^T λ` pulls both ends together for λ > 0. The **rod** is always active. The **rope** is active only while
taut:

- at the start of a step it is engaged if `|d| + max(0, u·v_r) dt ≥ L` (taut now or within this step);
  an engaging rope whose ends move apart (`u·v_r > 0`) first gets the outward velocity removed by the
  velocity projection (below): an **inelastic snap**, no bounce;
- after the solve a rope with λ < 0 (it would push) is released and the system is solved again
  (active-set iteration, at most once per constraint per step);
- its Baumgarte term only corrects a stretched rope (C < 0), never pushes a slack-by-a-few-mm one outward.

**Velocity projection**: `M Δv = Gᵀ Λ, G (v + Δv) = 0`, the same system as an impulse with `J = 0`
(`projectVelocities`).

### Gelenk and rigid joint (pin_joint, fixed_joint), v0.3

Between bodies a and b with local points `p_a`, `p_b`, `r = R(φ) p`:

```
C = (x_a + r_a) − (x_b + r_b)            rows [ I  perp(r_a) | −I  −perp(r_b) ]
γ₀ = ω_a² r_a − ω_b² r_b                 γ = γ₀ − 2 α Ċ − β² C
```

`fixed_joint` adds `C₃ = φ_a − φ_b − Δφ₀` with row `[0 0 1 | 0 0 −1]` and
`γ₃ = −2 α (ω_a − ω_b) − β² C₃`. λ is the force (and moment) on body a; body b gets the opposite.

### Loads, v0.2

A constant force `F` at body-local point `p` and a couple `M` add `F` to the force and
`cross(R(φ) p, F) + M` to the torque. Potential: `V = −F · (x_i + R(φ) p) − M φ`.

### Impulses at t = 0, v0.2

An impulse `J` (generalised: `[Jx, Jy, cross(r, J) + L]`) is a velocity jump that respects the constraints:

```
M Δv = J + Gᵀ Λ,        G (v + Δv) = 0      →   (G M⁻¹ Gᵀ) Λ = −G (v + M⁻¹ J)
```

This is the same Schur complement as the accelerations (`solveAccelerations` with `f = J`,
`γ = −G v`). Example: a horizontal impulse `J` at the lower end of a rod pinned at its top end gives
`ω = J h / I_A` and `v_cm = ω × r_cm`, not the free-body result `v = J / m`. The initial state saved for
`reset()` is the state **before** the impulse; the impulse is applied again after every reset.

### Solving

M is diagonal, so the Schur complement is cheap:

```
(G M⁻¹ Gᵀ) λ = γ − G M⁻¹ f
q̈ = M⁻¹ (f + Gᵀ λ)
```

The m×m system is solved with LU (`native/linalg`).

## Time integration: semi-implicit (symplectic) Euler

```
v ← v + q̈ dt
q ← q + v dt        (uses the new v)
t ← t + dt
```

Energy is not exactly conserved but stays bounded (oscillates with relative amplitude about
ω·dt/2). Validation tolerances in `tests/validation` are chosen accordingly.

## Reference results used in tests

- Mass–spring: `ω₀ = √(k/m)`, period `T = 2π/ω₀`.
- Physical pendulum pinned at distance d from the centre of mass:
  `T = 2π √(J_A / (m g d))`, `J_A = J + m d²` (small angle).
- Block on a frictionless incline (Loslager): `a = g sin(theta)` along the surface, normal force `m g cos(theta)`;
  with semi-implicit Euler `s_n = a dt² n (n + 1) / 2` is exact.
- Clamped block (fixed Lager) of length L: reaction `Fy = m g`, `M = m g L / 2` (balances the clockwise weight).
- Disc of radius r on a Festlager at its centre with a spring at the rim (stiffness k, vertical): small
  oscillations with `ω = sqrt(2 k / m)`, independent of r.
- Mass–spring–damper: `ζ = c / (2 √(k m))`, damped frequency `ω_d = ω₀ √(1 − ζ²)`, successive peaks shrink by
  `exp(−ζ ω₀ T_d)`; a mass hanging on a damper alone reaches the terminal velocity `m g / c`.
- Block of mass m hanging from two Stabs from `(±0.5, 1.5)` to its top corners `(±0.2, 0.6)`: each rod
  carries `m g / (2 cos θ)` with `cos θ = 0.9 / |(0.3, 0.9)|`.
- A mass falling 0.414 m onto a rope that goes taut loses `½ m v_r²` (`v_r` the velocity component along the rope
  at the snap); the tangential part is kept.
- Double pendulum of two uniform bars: the Lagrange equations (integrated with RK4 in
  `tests/validation/test_v03_physics.py`) with `I_cm = m (l² + w²) / 12`.
- Rigid L of two welded bars on a Festlager: physical pendulum, `T = 2π √(I_A / (M g d))`.
- Free fall with semi-implicit Euler from rest: `y_n = y_0 + g_y dt² n(n+1)/2` (exact for the scheme).
