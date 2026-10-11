# Equations of motion (v0.1)

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
- Free fall with semi-implicit Euler from rest: `y_n = y_0 + g_y dt² n(n+1)/2` (exact for the scheme).
