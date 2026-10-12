# Equations of motion (v0.1, extended in v0.2)

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
- Free fall with semi-implicit Euler from rest: `y_n = y_0 + g_y dt² n(n+1)/2` (exact for the scheme).
