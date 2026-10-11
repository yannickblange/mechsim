// pin_support.cpp - TICKET A4 implements this file.
#include "pin_support.hpp"

#include <stdexcept>

#include "../core/world.hpp"

namespace ms {

void PinSupport::initialize(const World& world) { throw std::logic_error("TODO(A4)"); }
void PinSupport::fill(const World& world, double* G, int cols, double* gamma) const {
    throw std::logic_error("TODO(A4)");
}
void PinSupport::setMultipliers(const double* lambda) { throw std::logic_error("TODO(A4)"); }
void PinSupport::writeFrame(const World& world, nlohmann::json& out) const {
    throw std::logic_error("TODO(A4)");
}

std::unique_ptr<Constraint> makePinSupport(const nlohmann::json& spec, const World& world) {
    throw std::logic_error("TODO(A4): makePinSupport");
}

}  // namespace ms
