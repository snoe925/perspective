/******************************************************************************
 *
 * Copyright (c) 2017, the Perspective Authors.
 *
 * This file is part of the Perspective library, distributed under the terms of
 * the Apache License 2.0.  The full license can be found in the LICENSE file.
 *
 */

const {execute, docker, clean, resolve, getarg, bash, python_image} = require("./script_utils.js");
const fs = require("fs-extra");
const IS_DOCKER = process.env.PSP_DOCKER;
const IS_PY2 = getarg("--python2");
const PYTHON = IS_PY2 ? "python2" : getarg("--python38") ? "python3.8" : getarg("--python36") ? "python3.6" : "python3.7";

let IMAGE = "manylinux2014";

if (IS_DOCKER) {
    // defaults to 2010
    let MANYLINUX_VERSION = "manylinux2010";
    if (!IS_PY2) {
        // switch to 2014 only on python3
        MANYLINUX_VERSION = getarg("--manylinux2010") ? "manylinux2010" : getarg("--manylinux2014") ? "manylinux2014" : "manylinux2014";
    }
    IMAGE = python_image(MANYLINUX_VERSION, PYTHON);
}

const PLATFORM = getarg("--platform");

/**
 * Using Perspective's docker images, create a wheel built for the image
 * architecture and output it to the local filesystem.
 */
try {
    // Determine the platform - either `manylinux` or `osx`
    if (!PLATFORM || !["manylinux", "osx"].includes(PLATFORM)) {
        throw new Error(`Invalid platform ${PLATFORM} - Supported platforms are "manylinux" and "osx"`);
    }

    console.log("Copying assets to `dist` folder");
    const dist = resolve`${__dirname}/../python/perspective/dist`;
    const cpp = resolve`${__dirname}/../cpp/perspective`;
    const lic = resolve`${__dirname}/../LICENSE`;
    const cmake = resolve`${__dirname}/../cmake`;
    const dcmake = resolve`${dist}/cmake`;
    const dlic = resolve`${dist}/LICENSE`;
    const obj = resolve`${dist}/obj`;

    fs.mkdirpSync(dist);
    fs.copySync(cpp, dist, {preserveTimestamps: true});
    fs.copySync(lic, dlic, {preserveTimestamps: true});
    fs.copySync(cmake, dcmake, {preserveTimestamps: true});
    clean(obj);

    let cmd;

    if (IS_PY2) {
        // shutil_which is required in setup.py
        cmd = bash`${PYTHON} -m pip install backports.shutil_which && `;
    } else {
        cmd = bash``;
    }

    // Create a wheel
    cmd += `${PYTHON} setup.py bdist_wheel`;

    const wheelhouse = resolve`${__dirname}/../python/perspective/wheelhouse`;

    if (PLATFORM === "manylinux") {
        // Use auditwheel on Linux
        cmd += `&& auditwheel -v show ./dist/*.whl && auditwheel -v repair -L .lib ./dist/*.whl -w ${wheelhouse}`;
    } else if (PLATFORM === "osx") {
        // Use delocate on MacOS
        cmd += `&& delocate-listdeps --all ./dist/*.whl && delocate-wheel -v ./dist/*.whl -w ${wheelhouse}`;
    } else {
        throw new Error("Unsupported platform specified for wheel build.");
    }

    // create a virtualenv and source it
    // if (!IS_PY2) {
    //     cmd += ` && python -m venv ./temp_venv && source ./temp_venv/bin/activate && \
    //         echo which python && \
    //         python -m pip install --force-reinstall ${wheelhouse}/*.whl && \
    //         python -c 'import perspective;print(perspective.is_libpsp())'`;
    // }

    if (IS_DOCKER) {
        console.log(`Building wheel for \`perspective-python\` for platform \`${PLATFORM}\` using image \`${IMAGE}\` in Docker`);
        execute`${docker(IMAGE)} bash -c "cd python/perspective && ${cmd}"`;
    } else {
        console.log(`Building wheel for \`perspective-python\` for platform \`${PLATFORM}\``);
        const python_path = resolve`${__dirname}/../python/perspective`;
        execute`cd ${python_path} && ${cmd}`;
    }
} catch (e) {
    console.error(e.message);
    process.exit(1);
}
