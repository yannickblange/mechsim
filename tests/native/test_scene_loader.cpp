// test_scene_loader.cpp - TICKET A7.
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>

#include "io/scene_loader.hpp"

using Catch::Matchers::ContainsSubstring;

namespace {

std::string readScene(const std::string& name) {
    std::string path = __FILE__;  // <root>/tests/native/test_scene_loader.cpp
    for (int i = 0; i < 3; ++i) path = path.substr(0, path.find_last_of("/\\"));
    std::ifstream in(path + "/scenes/" + name + ".json");
    REQUIRE(in.good());
    std::stringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

// A minimal valid scene to which individual tests apply a defect.
std::string scene(const std::string& version = "0.1", const std::string& bodyType = "block",
                  const std::string& springBody = "m", const std::string& secondBodyId = "") {
    std::string second;
    if (!secondBodyId.empty()) {
        second = R"(,{"id":")" + secondBodyId + R"(","type":"block","position":[1,0],
                  "params":{"mass":1,"width":0.1,"height":0.1}})";
    }
    return R"({"version":")" + version + R"(","bodies":[{"id":"m","type":")" + bodyType +
           R"(","position":[0,0],"params":{"mass":1,"width":0.1,"height":0.1}})" + second +
           R"(],"elements":[{"id":"k1","type":"spring","a":{"body":null,"point":[0,1]},
              "b":{"body":")" + springBody + R"(","point":[0,0]},"params":{"k":10}}]})";
}

}  // namespace

TEST_CASE("All example scenes load", "[loader]") {
    struct Case { const char* name; std::size_t bodies; };
    for (const Case& c : {Case{"single_mass_spring", 1}, Case{"physical_pendulum", 1},
                          Case{"pinned_block_spring", 1}, Case{"two_mass_chain", 2}}) {
        DYNAMIC_SECTION(c.name) {
            auto w = ms::loadScene(readScene(c.name));
            REQUIRE(w->bodies.size() == c.bodies);
            nlohmann::json f = w->frame();
            REQUIRE(f["bodies"].size() == c.bodies);
            REQUIRE(f.contains("energy"));
        }
    }
}

TEST_CASE("A valid minimal scene loads", "[loader]") {
    REQUIRE_NOTHROW(ms::loadScene(scene()));
}

TEST_CASE("Loader errors name the offending object", "[loader]") {
    REQUIRE_THROWS_WITH(ms::loadScene("{"), ContainsSubstring("invalid JSON"));
    REQUIRE_THROWS_WITH(ms::loadScene(scene("9")), ContainsSubstring("version"));
    REQUIRE_THROWS_WITH(ms::loadScene(scene("0.1", "sphere")), ContainsSubstring("'m'"));
    REQUIRE_THROWS_WITH(ms::loadScene(scene("0.1", "block", "ghost")), ContainsSubstring("k1"));
    REQUIRE_THROWS_WITH(ms::loadScene(scene("0.1", "block", "m", "m")), ContainsSubstring("'m'"));
}

TEST_CASE("Missing keys become runtime errors", "[loader]") {
    REQUIRE_THROWS_AS(ms::loadScene(R"({"version":"0.1"})"), std::runtime_error);
    REQUIRE_THROWS_AS(ms::loadScene("[]"), std::runtime_error);
    REQUIRE_THROWS_AS(ms::loadScene(R"({"version":"0.1","bodies":[{"id":"a"}]})"), std::runtime_error);
}
