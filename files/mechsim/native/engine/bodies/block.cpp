// block.cpp - TICKET A2 implements this file.
#include "block.hpp"

#include <stdexcept>

namespace ms {

void initBlock(Body& body, const nlohmann::json& params) {
    throw std::logic_error("TODO(A2): initBlock");
}

double blockInertia(double mass, double width, double height) {
    throw std::logic_error("TODO(A2): blockInertia");
}

}  // namespace ms
