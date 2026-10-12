// bar.cpp - elastic Stab.
#include "bar.hpp"

#include <stdexcept>
#include <string>

#include "../constraints/anchor_spec.hpp"
#include "../core/material.hpp"
#include "../core/world.hpp"

namespace ms {

void Bar::writeFrame(const World& world, nlohmann::json& out) const {
    Spring::writeFrame(world, out);
    out["stress"] = axialForce(world) / section.area;
}

std::unique_ptr<Element> makeBar(const nlohmann::json& spec, const World& world) {
    std::string id = "?";
    try {
        id = spec.at("id").get<std::string>();
        const std::string what = "bar '" + id + "'";
        auto bar = std::make_unique<Bar>();
        bar->id = id;
        bar->a = parseAnchorSpec(what, spec.at("a"), world, true);
        bar->b = parseAnchorSpec(what, spec.at("b"), world, true);
        if (bar->a.body == GROUND && bar->b.body == GROUND) {
            throw std::runtime_error(what + ": at least one end must be on a mass");
        }
        if (bar->a.body == bar->b.body) throw std::runtime_error(what + ": both ends are on the same mass");
        const double L0 = bar->currentLength(world);
        if (L0 < 1e-6) throw std::runtime_error(what + ": the ends coincide");
        bar->section = parseSection(spec.at("params").at("section"), what);
        bar->k = kYoungModulus * bar->section.area / L0;  // axial stiffness E A / L0
        bar->restLength = L0;                             // unstressed when installed
        return bar;
    } catch (const nlohmann::json::exception& e) {
        throw std::runtime_error("bar '" + id + "': " + e.what());
    }
}

}  // namespace ms
