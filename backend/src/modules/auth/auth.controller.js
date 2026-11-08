export function createAuthController(service) {
  return {
    async login(req, res) {
      res.json(await service.login(req.body));
    },
    me(req, res) {
      res.json({ user: req.authUser });
    },
  };
}
