export function createAuthController(service) {
  return {
    async login(req, res) {
      res.json(await service.login(req.body, req.ip));
    },
    me(req, res) {
      res.json({ user: req.authUser });
    },
    async renew(req, res) {
      res.json(await service.renew(req.headers.authorization.slice(7)));
    },
    async changePassword(req, res) {
      res.json(await service.changePassword(req.authUser.id, req.body));
    },
  };
}
