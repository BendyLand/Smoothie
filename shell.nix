# shell.nix
{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  nativeBuildInputs = with pkgs; [
    clang
    cmake
    ninja
    pkg-config
  ];

  buildInputs = with pkgs; [
    # Manifold build dependencies (mostly header-only math libraries)
    tbb # optional parallel backend for Manifold
  ];

  shellHook = ''
    echo "Odin + Manifold dev environment ready."
  '';
}
