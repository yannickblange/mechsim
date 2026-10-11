// test_capi.cpp - TICKET A7. The test binary does not link the shared library, so the C API
// implementation is included directly.
#include "../../native/engine/capi/mechsim_capi.cpp"

#include <string>

#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

using Catch::Matchers::WithinAbs;

namespace {
const char* kScene = R"JSON({
  "version": "0.1",
  "solver": { "dt": 0.001 },
  "bodies": [
    { "id": "m", "type": "block", "position": [0, 0],
      "params": { "mass": 1.0, "width": 0.2, "height": 0.2 } }
  ],
  "elements": [
    { "id": "k", "type": "spring",
      "a": { "body": null, "point": [0, 1.0] },
      "b": { "body": "m", "point": [0, 0] },
      "params": { "k": 100.0, "rest_length": 0.5 } }
  ]
})JSON";
}  // namespace

TEST_CASE("C API end to end", "[capi]") {
    REQUIRE(std::string(ms_version()) == "0.1.0");

    ms_world* w = ms_world_create(kScene);
    REQUIRE(w != nullptr);
    REQUIRE(ms_world_body_count(w) == 1);

    REQUIRE(ms_world_step(w, 0.0, 10) == MS_OK);
    REQUIRE_THAT(ms_world_time(w), WithinAbs(0.01, 1e-12));

    double buf[6];
    REQUIRE(ms_world_get_state(w, buf, 3) == MS_ERR);
    REQUIRE(ms_world_get_state(w, buf, 6) == 6);
    REQUIRE(buf[1] > 0.0);  // the spring pulls the block up

    const char* json = ms_world_frame_json(w);
    REQUIRE(json != nullptr);
    nlohmann::json frame = nlohmann::json::parse(json);
    REQUIRE(frame.contains("t"));

    REQUIRE(ms_world_reset(w) == MS_OK);
    REQUIRE(ms_world_time(w) == 0.0);

    ms_world_destroy(w);
}

TEST_CASE("C API reports errors instead of throwing", "[capi]") {
    REQUIRE(ms_world_create("{") == nullptr);
    REQUIRE(std::string(ms_last_error()).size() > 0);

    REQUIRE(ms_world_create(nullptr) == nullptr);
    REQUIRE(ms_world_step(nullptr, 0.0, 1) == MS_ERR);
    REQUIRE(ms_world_time(nullptr) == -1.0);
    REQUIRE(ms_world_body_count(nullptr) == MS_ERR);
    REQUIRE(ms_world_frame_json(nullptr) == nullptr);
    REQUIRE_NOTHROW(ms_world_destroy(nullptr));

    ms_world* w = ms_world_create(kScene);
    REQUIRE(w != nullptr);
    REQUIRE(ms_world_step(w, 0.0, 0) == MS_ERR);
    ms_world_destroy(w);
}
